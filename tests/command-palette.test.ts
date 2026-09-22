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
import { moveBy } from '../src/features/commands/navigation';
import { hostBookCommands, localShellCommands } from '../src/features/commands/sources';
import type { CommandActions, CommandContext } from '../src/features/commands/sources';
import type { LiveSession } from '../src/features/sessions';
import { createTranslator } from '../src/lib/i18n';
import type { LocalShellKind, Session } from '../src/ipc';

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
    forwards: [],
  };
}

function live(saved: Session, kind: LiveSession['kind'] = 'saved'): LiveSession {
  return { session: saved, handle: null, kind };
}

function actions(): CommandActions & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openHostInto: (id) => calls.push(`hostbook:${id}`),
    openLocalInto: () => calls.push('hostbook:local'),
    openLocalShellInto: (kind) => calls.push(`local:${kind.kind}`),
    placeHostOnMap: (id) => calls.push(`map:place:${id}`),
    newHostForMap: () => calls.push('map:new'),
  };
}

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    i18n: createTranslator('en'),
    sessions: [],
    workspace: 'sessions',
    localShellKinds: [],
    mapPlacement: null,
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

describe('what a palette row can hold', () => {
  it('keeps every detail short enough not to swallow its own title', () => {
    /* Found by driving the app, not by reading. `detail` is drawn `shrink-0`
       next to a title that is `truncate`, so a long detail does not wrap or
       clip itself — it takes the row and truncates the title to nothing.

       The bound is deliberately generous. This is not a style rule; it is the
       point past which a row stops showing what it does. */
    const rows = [
      ...hostBookCommands(context({ sessions: [live(session('a', 'alpha', 'host-a'))] })),
      ...localShellCommands(context({ localShellKinds: [{ kind: 'powerShell' }] })),
    ];

    for (const row of rows) {
      expect(row.detail?.length ?? 0).toBeLessThanOrEqual(24);
    }
  });
});

describe('the host book palette (ADR-0072)', () => {
  it('orders a bastion before whatever rides it, not the file’s raw order', () => {
    /* Same guarantee `hostRows` already gives Home's own list: the file
       lists the rider first here, and the palette must not repeat that
       order verbatim. */
    const rider: Session = { ...session('b', 'db-01', 'h2'), proxyJump: 'a' };
    const commands = hostBookCommands(
      context({ sessions: [live(rider), live(session('a', 'bastion', 'h1'))] }),
    );

    expect(commands.map((entry) => entry.id)).toEqual(['hostbook:a', 'hostbook:b']);
  });

  it('reaches a saved host by its address', () => {
    const commands = hostBookCommands(
      context({ sessions: [live(session('a', 'web-01', '10.0.4.31'))] }),
    );

    expect(commands.find((entry) => entry.id === 'hostbook:a')?.keywords).toContain('10.0.4.31');
  });

  it('puts a chosen host wherever the workspace beside the button stands for', () => {
    const act = actions();
    hostBookCommands(context({ sessions: [live(session('a', 'web-01', 'h1'))], actions: act }))
      .find((entry) => entry.id === 'hostbook:a')
      ?.run();

    expect(act.calls).toEqual(['hostbook:a']);
  });

  it('leaves "this machine" out of the Sessions workspace', () => {
    /* Sessions has no local endpoint to fill; that row belongs to SFTP's
       fan-out alone. */
    const commands = hostBookCommands(context({ workspace: 'sessions' }));
    expect(commands.map((entry) => entry.id)).not.toContain('hostbook:local');
  });

  it('offers "this machine" first among saved hosts in the SFTP workspace', () => {
    const commands = hostBookCommands(
      context({ workspace: 'sftp', sessions: [live(session('a', 'web-01', 'h1'))] }),
    );

    expect(commands.map((entry) => entry.id)).toEqual(['hostbook:local', 'hostbook:a']);
  });

  it('runs the local endpoint into the same slot a host would land in', () => {
    const act = actions();
    hostBookCommands(context({ workspace: 'sftp', actions: act }))
      .find((entry) => entry.id === 'hostbook:local')
      ?.run();

    expect(act.calls).toEqual(['hostbook:local']);
  });

  it('does not offer to create a host: this "+" places an existing one', () => {
    /* Creating one is Home's own row or the hosts-manager sidebar's own
       affordance instead (ADR-0076); the general palette has no create
       command of its own either. */
    const commands = hostBookCommands(context());
    expect(commands.map((entry) => entry.id)).not.toContain('hostbook:new');
  });

  it('leaves out a host already carrying a component of the kind the map asked for', () => {
    /* `HostPicker`'s old `duplicate` refusal (ADR-0064), avoided here by not
       offering the blocked row rather than showing it and saying no. */
    const commands = hostBookCommands(
      context({
        workspace: 'map',
        sessions: [live(session('a', 'web-01', 'h1')), live(session('b', 'db-01', 'h2'))],
        mapPlacement: { kind: 'ssh', changing: null, layer: null, blockedHostIds: new Set(['a']) },
      }),
    );

    expect(commands.map((entry) => entry.id)).toEqual(['hostbook:b', 'hostbook:new']);
  });

  it('places a picked host on the map instead of into a pane, while a placement is requested', () => {
    const act = actions();
    hostBookCommands(
      context({
        workspace: 'map',
        sessions: [live(session('a', 'web-01', 'h1'))],
        mapPlacement: { kind: 'ssh', changing: null, layer: null, blockedHostIds: new Set() },
        actions: act,
      }),
    )
      .find((entry) => entry.id === 'hostbook:a')
      ?.run();

    expect(act.calls).toEqual(['map:place:a']);
  });

  it('offers to create a host on the map while a placement is requested there', () => {
    const act = actions();
    const commands = hostBookCommands(
      context({
        workspace: 'map',
        mapPlacement: { kind: 'ssh', changing: null, layer: null, blockedHostIds: new Set() },
        actions: act,
      }),
    );

    commands.find((entry) => entry.id === 'hostbook:new')?.run();
    expect(act.calls).toEqual(['map:new']);
  });
});

describe('the local shell palette (ADR-0074)', () => {
  const powerShell: LocalShellKind = { kind: 'powerShell' };
  const wsl: LocalShellKind = { kind: 'wsl', distro: 'Ubuntu' };

  it('offers one row per shell this platform detected', () => {
    const commands = localShellCommands(context({ localShellKinds: [powerShell, wsl] }));

    expect(commands.map((entry) => entry.id)).toEqual(['local:powerShell', 'local:wsl:Ubuntu']);
  });

  it('opens the chosen kind into the same slot a host would land in', () => {
    const act = actions();
    localShellCommands(context({ localShellKinds: [powerShell], actions: act }))
      .find((entry) => entry.id === 'local:powerShell')
      ?.run();

    expect(act.calls).toEqual(['local:powerShell']);
  });

  it('leaves local shells out of the SFTP workspace', () => {
    /* SFTP's "+" places file endpoints, not terminal sessions; a shell has
       nothing to contribute there. */
    const commands = localShellCommands(
      context({ workspace: 'sftp', localShellKinds: [powerShell, wsl] }),
    );

    expect(commands).toEqual([]);
  });

  it('leaves local shells out while the map is asking for a host', () => {
    /* A local shell answers none of the kinds the map's radial menu asks
       this "+" for; offering one here would run it into a Sessions tab-strip
       slot the user is not even looking at. */
    const commands = localShellCommands(
      context({
        workspace: 'map',
        localShellKinds: [powerShell, wsl],
        mapPlacement: { kind: 'ssh', changing: null, layer: null, blockedHostIds: new Set() },
      }),
    );

    expect(commands).toEqual([]);
  });
});
