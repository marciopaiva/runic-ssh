/**
 * Guards the command palette and the registry behind it.
 *
 * The registry is the part of this that matters in a year: a palette bolted on
 * later only ever sees the commands somebody remembered to register. So most
 * of what is asserted here is about the registry and the ranking, both of
 * which are pure and neither of which needs a window.
 */

import { describe, expect, it, vi } from 'vitest';

import { bySection, collect } from '../src/features/commands/registry';
import type { Command } from '../src/features/commands/registry';
import { fold, rank } from '../src/features/commands/match';
import { isPaletteShortcut, moveBy } from '../src/features/commands/navigation';
import { actionCommands, sessionCommands } from '../src/features/commands/sources';
import type { CommandActions, CommandContext } from '../src/features/commands/sources';
import type { Tab } from '../src/features/chrome';
import type { LiveSession } from '../src/features/sessions';
import { createTranslator, offeredLocales } from '../src/lib/i18n';
import type { Session } from '../src/ipc';

function command(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, section: 'actions', title, run: () => undefined, ...extra };
}

function session(id: string, name: string, host: string, group: string | null = null): Session {
  return {
    id,
    name,
    host,
    port: 22,
    user: 'deploy',
    group,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
  };
}

function live(saved: Session, kind: LiveSession['kind'] = 'saved'): LiveSession {
  return { session: saved, handle: null, kind };
}

function tab(sessionId: string): Tab {
  return { sessionId, title: sessionId, kind: 'connected', handle: 1 };
}

function actions(): CommandActions & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    newSession: () => calls.push('new'),
    editSession: (id) => calls.push(`edit:${id}`),
    selectSession: (id) => calls.push(`select:${id}`),
    activateTab: (id) => calls.push(`activate:${id}`),
    closeTab: (id) => calls.push(`close:${id}`),
    moveTab: (step) => calls.push(`move:${step}`),
    openSettings: () => calls.push('settings'),
    window: (action) => calls.push(`window:${action}`),
    chooseLocale: (locale) => calls.push(`locale:${locale ?? 'system'}`),
    useNativeDecorations: (native) => calls.push(`decorations:${native}`),
    splitPanel: (kind) => calls.push(`split:${kind}`),
    moveTabToGroup: (at) => calls.push(`group:move:${at}`),
    closeGroup: () => calls.push('group:close'),
    toggleSync: () => calls.push('sync'),
  };
}

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    i18n: createTranslator('en'),
    sessions: [],
    tabs: [],
    activeId: null,
    chosenLocale: null,
    nativeDecorations: false,
    maximized: false,
    layout: '1x1',
    syncing: false,
    panesFilled: 0,
    groupCount: 1,
    focusedGroup: -1,
    focusedTitle: null,
    actions: actions(),
    ...overrides,
  };
}

describe('the registry', () => {
  it('asks every source', () => {
    const collected = collect([
      () => [command('a', 'A')],
      () => [command('b', 'B'), command('c', 'C')],
    ]);

    expect(collected.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('asks the sources again rather than caching them', () => {
    /* A tab closed while the palette is open must stop being offered. */
    const source = vi.fn(() => [command('a', 'A')]);

    collect([source]);
    collect([source]);

    expect(source).toHaveBeenCalledTimes(2);
  });

  it('refuses a duplicate id', () => {
    /* Two rows sharing an id share an aria-activedescendant: the screen
       reader announces one and Enter runs the other. */
    const collected = collect([() => [command('a', 'First')], () => [command('a', 'Second')]]);

    expect(collected).toHaveLength(1);
    expect(collected[0]?.title).toBe('First');
  });

  it('puts sessions before actions', () => {
    /* The commonest reason to open a palette in an SSH client is to go
       somewhere, not to change a setting. */
    const groups = bySection([
      { command: command('a', 'A') },
      { command: command('s', 'S', { section: 'sessions' }) },
    ]);

    expect(groups.map((group) => group.section)).toEqual(['sessions', 'actions']);
  });

  it('does not draw an empty section', () => {
    expect(bySection([{ command: command('a', 'A') }]).map((g) => g.section)).toEqual(['actions']);
  });
});

describe('folding', () => {
  it('ignores accents', () => {
    /* Two of the three languages put diacritics in ordinary words. Matching
       the raw string means the search box stops working the moment the
       interface is not in English. */
    expect(fold('Sessões')).toBe('sessoes');
    expect(fold('Conexión')).toBe('conexion');
    expect(fold('Ação')).toBe('acao');
  });
});

describe('ranking', () => {
  it('keeps registry order for an empty query', () => {
    /* An empty palette is a menu, and a menu that reorders itself is not one. */
    const commands = [command('a', 'Zebra'), command('b', 'Apple')];

    expect(rank('', commands).map((m) => m.command.id)).toEqual(['a', 'b']);
  });

  it('finds a command through its accents', () => {
    const commands = [command('a', 'Fechar sessão')];

    expect(rank('sessao', commands)).toHaveLength(1);
  });

  it('ignores case', () => {
    expect(rank('CLOSE', [command('a', 'Close tab')])).toHaveLength(1);
  });

  it('ranks a word start above the middle of a word', () => {
    /* The shorter title is registered first and wins every tiebreak this
       ranking has apart from position, so only positional scoring can move
       the longer one above it. An earlier version of this test used a pair
       where one candidate did not match at all, and passed against a ranking
       that did no ranking. */
    const commands = [command('middle', 'Recall'), command('start', 'Close all and disconnect')];

    expect(rank('cl', commands)[0]?.command.id).toBe('start');
  });

  it('matches letters in order, not as a set', () => {
    expect(rank('bat', [command('a', 'Close tab')])).toHaveLength(0);
  });

  it('matches a keyword without showing it', () => {
    /* Typing an address finds a host saved under a friendly name. */
    const commands = [command('a', 'Switch to web-01', { keywords: ['10.0.4.31'] })];
    const [match] = rank('10.0.4', commands);

    expect(match?.command.id).toBe('a');
    expect(match?.highlights).toEqual([]);
  });

  it('ranks a title match above a keyword match', () => {
    const commands = [
      command('keyword', 'Something else', { keywords: ['web'] }),
      command('title', 'web-01'),
    ];

    expect(rank('web', commands)[0]?.command.id).toBe('title');
  });

  it('reports where the match landed', () => {
    expect(rank('ct', [command('a', 'Close tab')])[0]?.highlights).toEqual([0, 6]);
  });

  it('is stable for equal scores', () => {
    /* The list must not shuffle while somebody is reading it. */
    const commands = [command('a', 'Tab one'), command('b', 'Tab two')];

    expect(rank('tab', commands).map((m) => m.command.id)).toEqual(['a', 'b']);
  });
});

describe('moving through the list', () => {
  it('wraps at both ends', () => {
    expect(moveBy(3, 2, 1)).toBe(0);
    expect(moveBy(3, 0, -1)).toBe(2);
  });

  it('has nowhere to go in an empty list', () => {
    expect(moveBy(0, 0, 1)).toBe(0);
  });
});

describe('the shortcut', () => {
  const press = (over: Partial<KeyboardEvent>): Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey'> => ({
    code: 'KeyP',
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    ...over,
  });

  it('is Command-Shift-P on macOS', () => {
    expect(isPaletteShortcut(press({ metaKey: true }), 'meta')).toBe(true);
    expect(isPaletteShortcut(press({ ctrlKey: true }), 'meta')).toBe(false);
  });

  it('is Ctrl-Shift-P everywhere else', () => {
    expect(isPaletteShortcut(press({ ctrlKey: true }), 'control')).toBe(true);
    expect(isPaletteShortcut(press({ metaKey: true }), 'control')).toBe(false);
  });

  it('needs Shift', () => {
    expect(isPaletteShortcut(press({ ctrlKey: true, shiftKey: false }), 'control')).toBe(false);
  });

  it('is not both modifiers at once', () => {
    /* Ctrl-Cmd-Shift-P on a Mac belongs to something else, and swallowing it
       would take a binding away from the system or the terminal. */
    expect(isPaletteShortcut(press({ ctrlKey: true, metaKey: true }), 'meta')).toBe(false);
  });

  it('follows the physical key, not the character', () => {
    /* With Shift held, `key` is not `p` on every layout. `code` is. */
    expect(isPaletteShortcut(press({ code: 'KeyO', ctrlKey: true }), 'control')).toBe(false);
  });
});

describe('what the palette offers', () => {
  it('offers a way to add a host even with nothing saved', () => {
    /* An SSH client whose palette lists no way to add a host is one nobody
       can use. That shipped once — the "+" opened the palette, and the
       palette had nothing to open. */
    const act = actions();
    const commands = sessionCommands(context({ actions: act }));

    const add = commands.find((entry) => entry.id === 'session:new');
    expect(add).toBeDefined();

    add?.run();
    expect(act.calls).toEqual(['new']);
  });

  it('reaches every saved host', () => {
    const commands = sessionCommands(
      context({ sessions: [live(session('a', 'web-01', '10.0.4.31'))] }),
    );

    const reach = commands.find((entry) => entry.id === 'session:a');
    expect(reach?.keywords).toContain('10.0.4.31');
  });

  it('offers a way to edit every saved host', () => {
    const act = actions();
    const commands = sessionCommands(
      context({ sessions: [live(session('a', 'web-01', 'h1'))], actions: act }),
    );

    commands.find((entry) => entry.id === 'session:edit:a')?.run();
    expect(act.calls).toEqual(['edit:a']);
  });

  it('switches to an open session and selects a closed one', () => {
    const act = actions();
    const commands = sessionCommands(
      context({
        sessions: [live(session('a', 'web-01', 'h1')), live(session('b', 'db-01', 'h2'))],
        tabs: [tab('a')],
        actions: act,
      }),
    );

    commands.find((entry) => entry.id === 'session:a')?.run();
    commands.find((entry) => entry.id === 'session:b')?.run();

    expect(act.calls).toEqual(['activate:a', 'select:b']);
  });

  it('always offers a way into the settings', () => {
    /* The palette is how the settings tab is reached before it exists, and
       until this landed the language could only be changed from here at all.
       Unconditional on purpose: nothing about it depends on a session. */
    const entry = actionCommands(context()).find((command) => command.id === 'settings:open');

    expect(entry).toBeDefined();

    const acted = actions();
    actionCommands(context({ actions: acted }))
      .find((command) => command.id === 'settings:open')
      ?.run();

    expect(acted.calls).toEqual(['settings']);
  });

  it('offers no tab commands with no tab open', () => {
    /* An entry that reports its own unavailability costs a keystroke, a read
       and a disappointment, in a list whose value is that everything works. */
    const ids = actionCommands(context()).map((entry) => entry.id);

    expect(ids).not.toContain('tab:close');
    expect(ids).not.toContain('tab:next');
  });

  it('offers no way to move between tabs when there is only one', () => {
    const ids = actionCommands(context({ tabs: [tab('a')], activeId: 'a' })).map((e) => e.id);

    expect(ids).toContain('tab:close');
    expect(ids).not.toContain('tab:next');
  });

  it('offers restore instead of maximize on a maximized window', () => {
    const ids = actionCommands(context({ maximized: true })).map((entry) => entry.id);

    expect(ids).toContain('window:restore');
    expect(ids).not.toContain('window:maximize');
  });

  it('does not offer the language already in use', () => {
    /* Running it is a no-op the user cannot tell apart from the palette
       having failed. */
    const ids = actionCommands(context({ chosenLocale: 'pt-BR' })).map((entry) => entry.id);

    expect(ids).not.toContain('locale:pt-BR');
    expect(ids).toContain('locale:en');
  });

  it('offers to follow the system only when it is not already', () => {
    expect(actionCommands(context()).map((e) => e.id)).not.toContain('locale:system');
    expect(actionCommands(context({ chosenLocale: 'en' })).map((e) => e.id)).toContain(
      'locale:system',
    );
  });

  it('offers only languages cleared to be offered', () => {
    /* The palette is a way into the application; it must not be a way around
       the selector. Written against the registry rather than against one
       locale's name: it named Spanish while Spanish was the one held back, and
       an assertion that a since-cleared locale is absent is one that passes by
       being wrong. Whatever is held back next is covered by this without
       anybody remembering to come back. */
    const offered = new Set(offeredLocales().map((locale) => `locale:${locale.tag}`));
    const languages = actionCommands(context())
      .map((entry) => entry.id)
      .filter((id) => id.startsWith('locale:') && id !== 'locale:system');

    expect(new Set(languages)).toEqual(offered);
  });

  it('titles every command in the active language', () => {
    const titles = actionCommands(context({ i18n: createTranslator('pt-BR') })).map(
      (entry) => entry.title,
    );

    expect(titles).toContain('Minimizar janela');
  });
});

describe('moving a tab between groups', () => {
  function ids(over: Parameters<typeof context>[0]): readonly string[] {
    return actionCommands(context(over)).map((entry) => entry.id);
  }

  const focused = { focusedGroup: 0, focusedTitle: 'web-01' } as const;

  it('offers nothing with nothing focused', () => {
    expect(ids({ groupCount: 4 }).filter((id) => id.startsWith('group:'))).toEqual([]);
  });

  it('offers every rectangle but the one it is in', () => {
    const offered = ids({ ...focused, groupCount: 4 });

    expect(offered).toContain('group:move:1');
    expect(offered).toContain('group:move:3');
    expect(offered).not.toContain('group:move:0');
  });

  it('offers no move with one rectangle', () => {
    expect(ids({ ...focused, groupCount: 1 }).filter((id) => id.startsWith('group:move'))).toEqual(
      [],
    );
  });

  it('names the tab, because with four rectangles the move is a question', () => {
    const entry = actionCommands(context({ ...focused, groupCount: 2 })).find(
      (command) => command.id === 'group:move:1',
    );

    expect(entry?.title).toContain('web-01');
    expect(entry?.title).toContain('2');
  });

  it('offers closing the group whenever one is focused', () => {
    expect(ids({ ...focused, groupCount: 1 })).toContain('group:close');
    expect(ids({ groupCount: 4 })).not.toContain('group:close');
  });

  it('runs the move it names', () => {
    const act = actions();
    actionCommands(context({ ...focused, groupCount: 2, actions: act }))
      .find((entry) => entry.id === 'group:move:1')
      ?.run();

    expect(act.calls).toEqual(['group:move:1']);
  });
});

describe('the window decoration hatch', () => {
  it('offers the system title bar while the app is drawing its own', () => {
    /* ADR-0005 turned decorations off and named this the escape hatch for a
       window manager that leaves an undecorated window impossible to resize.
       The palette is the only way to reach it — there is no settings panel —
       and it opens from the keyboard, which matters when the window itself
       cannot be moved. */
    const entry = actionCommands(context({ nativeDecorations: false })).find(
      (command) => command.id === 'chrome:decorations',
    );

    expect(entry?.title).toBe('Use the system title bar');
  });

  it('offers the way back once the system is drawing it', () => {
    /* A one-way door would strand a user who tried it and preferred the
       design, with no way back except editing settings.json by hand. */
    const entry = actionCommands(context({ nativeDecorations: true })).find(
      (command) => command.id === 'chrome:decorations',
    );

    expect(entry?.title).toBe("Use the app's title bar");
  });

  it('asks for the opposite of what is in force', () => {
    const called = actions();

    actionCommands(context({ nativeDecorations: false, actions: called }))
      .find((command) => command.id === 'chrome:decorations')
      ?.run();
    actionCommands(context({ nativeDecorations: true, actions: called }))
      .find((command) => command.id === 'chrome:decorations')
      ?.run();

    expect(called.calls).toEqual(['decorations:true', 'decorations:false']);
  });

  it('is findable by what a stuck user would type, in three languages', () => {
    /* Someone reaching for this is describing a symptom, not our vocabulary.
       The keywords carry the Portuguese and Spanish words because the palette
       matches on them and a translated title alone would not be found by a
       user typing the English word, or the reverse. */
    const entry = actionCommands(context()).find(
      (command) => command.id === 'chrome:decorations',
    );

    for (const word of ['decorations', 'titlebar', 'decoracoes', 'decoraciones', 'barra']) {
      expect(entry?.keywords).toContain(word);
    }
  });
});

describe('what a palette row can hold', () => {
  it('keeps every detail short enough not to swallow its own title', () => {
    /* Found by driving the app, not by reading. `detail` is drawn `shrink-0`
       next to a title that is `truncate`, so a long detail does not wrap or
       clip itself — it takes the row and truncates the title to nothing. The
       first version of the decorations command shipped a sentence there and
       rendered as a row with no title at all.

       The bound is deliberately generous. This is not a style rule; it is the
       point past which a row stops showing what it does. */
    const rows = [
      ...actionCommands(context()),
      ...sessionCommands(context({ sessions: [live(session('a', 'alpha', 'host-a'))] })),
    ];

    for (const row of rows) {
      expect(row.detail?.length ?? 0).toBeLessThanOrEqual(24);
    }
  });
});

describe('dividing the panel', () => {
  function ids(over: Parameters<typeof context>[0]): readonly string[] {
    return actionCommands(context(over)).map((entry) => entry.id);
  }

  it('offers the shapes with a single session open', () => {
    /* Splitting first and connecting into the empty pane is the ordinary way
       round: picking a tab fills an empty pane before it replaces the focused
       one. Requiring two open sessions made the command invisible exactly
       when somebody first went looking for it. */
    expect(ids({ tabs: [tab('a')], activeId: 'a' })).toEqual(
      expect.arrayContaining(['split:2x1', 'split:1x2', 'split:2x2', 'split:3x2', 'split:2x3', 'split:3x3']),
    );
  });

  it('offers nothing to divide when nothing is open', () => {
    expect(ids({})).not.toContain('split:2x1');
  });

  it('leaves out the shape already in use', () => {
    const offered = ids({ tabs: [tab('a')], activeId: 'a', layout: '2x1' });
    expect(offered).not.toContain('split:2x1');
    expect(offered).toContain('split:1x2');
  });

  it('offers the way back only once there is something to go back from', () => {
    expect(ids({ tabs: [tab('a')], activeId: 'a' })).not.toContain('split:none');
    expect(ids({ tabs: [tab('a')], activeId: 'a', layout: '2x2' })).toContain('split:none');
  });

  it('offers the sync switch only when it would reach somewhere', () => {
    /* Armed against one pane it would do nothing and still say it was on,
       which for this switch is worse than being absent. */
    expect(ids({ tabs: [tab('a')], activeId: 'a', layout: '2x1', panesFilled: 1 })).not.toContain(
      'split:sync',
    );
    expect(ids({ tabs: [tab('a')], activeId: 'a', layout: '2x1', panesFilled: 2 })).toContain(
      'split:sync',
    );
  });

  it('says how many hosts arming it would reach', () => {
    const entry = actionCommands(
      context({ tabs: [tab('a')], activeId: 'a', layout: '2x2', panesFilled: 3 }),
    ).find((command) => command.id === 'split:sync');

    expect(entry?.detail).toContain('3');
  });

  it('runs the shape it names', () => {
    const act = actions();
    actionCommands(context({ tabs: [tab('a')], activeId: 'a', actions: act }))
      .find((entry) => entry.id === 'split:2x2')
      ?.run();

    expect(act.calls).toEqual(['split:2x2']);
  });
});
