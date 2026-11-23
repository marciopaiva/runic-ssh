/**
 * Guards the Bar: its grammar, its shortcut, and what each mode lists.
 *
 * Pure functions, no window. The two rules worth a test of their own are that
 * `>` never offers anything but a saved macro (ADR-0078) and that the shortcut
 * leaves Ctrl+K to the terminal.
 */

import { describe, expect, it } from 'vitest';

import {
  isBarShortcut,
  listedIn,
  parseBar,
  recentsFirst,
  remember,
  RECENT_LIMIT,
} from '../src/features/commands/grammar';
import { actionCommands, fileCommands, hostBookCommands, macroCommands } from '../src/features/commands/sources';
import type { CommandActions, CommandContext } from '../src/features/commands/sources';
import type { LiveSession } from '../src/features/sessions';
import { createTranslator } from '../src/lib/i18n';
import { isMac } from '../src/lib/platform';
import type { Macro, Session } from '../src/ipc';

const key = (code: string, extra: Partial<KeyboardEvent> = {}) => ({
  type: 'keydown',
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: `host ${id}`,
    host: `${id}.example.test`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    forwards: [],
    ...over,
  };
}

const macro = (id: string, kind: Macro['kind']): Macro => ({ id, name: `macro ${id}`, kind, text: 'true' });

function context(over: Partial<CommandContext> = {}): { ctx: CommandContext; calls: string[] } {
  const calls: string[] = [];
  const actions: CommandActions = {
    openHostInto: (id) => calls.push(`open:${id}`),
    openLocalInto: () => undefined,
    openLocalShellInto: () => undefined,
    goTo: (workspace) => calls.push(`go:${workspace}`),
    toggleMacros: () => calls.push('macros'),
    toggleHosts: () => calls.push('hosts'),
    switchSpace: (id) => calls.push(`space:${id}`),
    newSpace: () => calls.push('space:new'),
    importGroups: () => calls.push('space:import'),
    openFilesOf: (id) => calls.push(`files:${id}`),
    runMacro: (m, scope) => calls.push(`run:${m.id}:${scope.join(',')}`),
  };
  const sessions: LiveSession[] = [session('a'), session('b')].map((saved) => ({
    session: saved,
    handle: null,
    kind: 'saved',
  }));
  return {
    calls,
    ctx: {
      i18n: createTranslator('en'),
      sessions,
      workspace: 'sessions',
      macros: [macro('s', 'script'), macro('q', 'sequential')],
      spaces: [],
      importable: 0,
      activeSpace: '',
      hasTarget: true,
      macrosOpen: false,
      hostsOpen: false,
      localShellKinds: [],
      actions,
      ...over,
    },
  };
}

describe('the grammar', () => {
  it('reads the first character as the mode', () => {
    expect(parseBar('@prod')).toEqual({ mode: 'hosts', term: 'prod' });
    expect(parseBar('>deploy')).toEqual({ mode: 'macros', term: 'deploy' });
    expect(parseBar('/web')).toEqual({ mode: 'files', term: 'web' });
    expect(parseBar('web')).toEqual({ mode: 'all', term: 'web' });
  });

  it('reads a token in the middle as text', () => {
    expect(parseBar('a@b')).toEqual({ mode: 'all', term: 'a@b' });
  });

  it('lists each role only where it belongs', () => {
    expect(listedIn('hosts', 'host')).toBe(true);
    expect(listedIn('hosts', 'macro')).toBe(false);
    expect(listedIn('macros', 'macro')).toBe(true);
    expect(listedIn('macros', undefined)).toBe(false);
    expect(listedIn('files', 'files')).toBe(true);
    /* A files row would repeat every host in the unmarked mode. */
    expect(listedIn('all', 'files')).toBe(false);
    expect(listedIn('all', undefined)).toBe(true);
    expect(listedIn('all', 'host')).toBe(true);
  });
});

describe('the shortcut', () => {
  it('is Ctrl+Shift+P off a Mac', () => {
    expect(isBarShortcut(key('KeyP', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  it('is Cmd+K on a Mac', () => {
    expect(isBarShortcut(key('KeyK', { metaKey: true }), true)).toBe(true);
    expect(isBarShortcut(key('KeyP', { ctrlKey: true, shiftKey: true }), true)).toBe(false);
  });

  it('leaves Ctrl+K to the terminal', () => {
    expect(isBarShortcut(key('KeyK', { ctrlKey: true }), false)).toBe(false);
    expect(isBarShortcut(key('KeyK', { ctrlKey: true, shiftKey: true }), false)).toBe(false);
  });

  it('ignores key releases and extra modifiers', () => {
    expect(isBarShortcut({ ...key('KeyP', { ctrlKey: true, shiftKey: true }), type: 'keyup' }, false)).toBe(false);
    expect(isBarShortcut(key('KeyP', { ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe(false);
  });

  it('tells a Mac from the user agent', () => {
    expect(isMac('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(true);
    expect(isMac('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });
});

describe('recents', () => {
  it('puts what was run first, most recent first, and keeps the rest in order', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(recentsFirst(rows, ['c', 'a']).map((row) => row.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('skips a recent that is no longer offered', () => {
    expect(recentsFirst([{ id: 'a' }], ['gone', 'a']).map((row) => row.id)).toEqual(['a']);
  });

  it('keeps each id once and a bounded number of them', () => {
    expect(remember(['a', 'b'], 'b')).toEqual(['b', 'a']);
    const many = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) => `id${i}`).reduce(
      (acc, id) => remember(acc, id),
      [] as readonly string[],
    );
    expect(many).toHaveLength(RECENT_LIMIT);
  });
});

describe('what the Bar offers', () => {
  it('marks hosts so `@` can list them and carries a hint without secrets', () => {
    const { ctx } = context({
      sessions: [
        { session: session('jump', { name: 'jump' }), handle: null, kind: 'saved' },
        { session: session('a', { credentialId: 'cred-1', proxyJump: 'jump' }), handle: null, kind: 'saved' },
      ],
    });
    const row = hostBookCommands(ctx).find((candidate) => candidate.subject === 'a');
    expect(row?.role).toBe('host');
    expect(row?.subject).toBe('a');
    expect(row?.hint).toContain('login saved');
    expect(row?.hint).toContain('via jump');
    expect(row?.hint).not.toContain('cred-1');
  });

  it('names the jump host and not its id', () => {
    const bastion = session('bastion-id', { name: 'the bastion' });
    const behind = session('behind', { proxyJump: 'bastion-id' });
    const { ctx } = context({
      sessions: [bastion, behind].map((saved) => ({ session: saved, handle: null, kind: 'saved' as const })),
    });
    const hint = hostBookCommands(ctx).find((row) => row.subject === 'behind')?.hint ?? '';
    expect(hint).toContain('via the bastion');
    expect(hint).not.toContain('bastion-id');
  });

  it('says so when the jump host is no longer saved, not printing its id', () => {
    const { ctx } = context({
      sessions: [{ session: session('behind', { proxyJump: 'gone-id' }), handle: null, kind: 'saved' }],
    });
    const hint = hostBookCommands(ctx)[0]?.hint ?? '';
    expect(hint).toContain('a host that is no longer saved');
    expect(hint).not.toContain('gone-id');
  });

  it('reads a host the core sent without its unset fields', () => {
    /* `skip_serializing_if` leaves a null out of the file, so the field is
       absent rather than null by the time it reaches the Bar. */
    const bare = JSON.parse(
      '{"id":"a","name":"n","host":"h","port":22,"user":"u","kind":"direct","forwards":[]}',
    ) as Session;
    const { ctx } = context({ sessions: [{ session: bare, handle: null, kind: 'saved' }] });
    const hint = hostBookCommands(ctx)[0]?.hint ?? '';
    expect(hint).toContain('no login saved');
    expect(hint).not.toContain('via');
    expect(hint).not.toContain('{');
  });

  it('lists every saved macro without a scope, and only scripts with one', () => {
    const { ctx } = context();
    expect(macroCommands(ctx, []).map((row) => row.id)).toEqual(['macro:s', 'macro:q']);
    expect(macroCommands(ctx, ['a']).map((row) => row.id)).toEqual(['macro:s']);
  });

  it('offers no macro when there is nowhere for it to go', () => {
    const { ctx } = context({ hasTarget: false });
    expect(macroCommands(ctx, [])).toEqual([]);
    expect(macroCommands(ctx, ['a'])).toHaveLength(1);
  });

  it('runs a macro with the scope it was listed under', () => {
    const { ctx, calls } = context();
    macroCommands(ctx, ['a', 'b'])[0]?.run();
    expect(calls).toEqual(['run:s:a,b']);
  });

  it('only ever runs a saved macro', () => {
    const { ctx } = context();
    /* Every row in macro mode comes from the saved list: there is no row that
       takes the text typed into the field. */
    expect(macroCommands(ctx, []).every((row) => row.id.startsWith('macro:'))).toBe(true);
  });

  it('puts scoped hosts first for files', () => {
    const { ctx, calls } = context();
    const rows = fileCommands(ctx, ['b']);
    expect(rows.map((row) => row.subject)).toEqual(['b', 'a']);
    rows[0]?.run();
    expect(calls).toEqual(['files:b']);
  });

  it('offers a workspace switch only to somewhere else', () => {
    const { ctx } = context({ workspace: 'sessions' });
    const ids = actionCommands(ctx).map((row) => row.id);
    expect(ids).toContain('action:go:home');
    expect(ids).toContain('action:go:sftp');
    expect(ids).not.toContain('action:go:sessions');
    expect(ids).toContain('action:hosts');
  });

  it('does not offer the hosts panel outside SSH, and names the macros panel by its state', () => {
    const { ctx } = context({ workspace: 'sftp', macrosOpen: true });
    const rows = actionCommands(ctx);
    expect(rows.map((row) => row.id)).not.toContain('action:hosts');
    expect(rows.find((row) => row.id === 'action:macros')?.title).toBe('Hide macros');
  });
});

describe('Spaces in the Bar', () => {
  const spaces = [
    { id: 'p', name: 'Production', weight: 'production' as const },
    { id: 'l', name: 'Lab', weight: 'normal' as const },
  ];

  it('offers a Space switch only once a Space exists, and never to the one in front', () => {
    expect(actionCommands(context().ctx).map((row) => row.id)).not.toContain('action:space:default');

    const { ctx } = context({ spaces, activeSpace: 'p' });
    const ids = actionCommands(ctx).map((row) => row.id);
    expect(ids).toContain('action:space:default');
    expect(ids).toContain('action:space:l');
    expect(ids).not.toContain('action:space:p');
  });

  it('always offers a new Space, and runs the switch it names', () => {
    const { ctx, calls } = context({ spaces, activeSpace: '' });
    const rows = actionCommands(ctx);
    rows.find((row) => row.id === 'action:space:p')?.run();
    rows.find((row) => row.id === 'action:space:new')?.run();
    expect(calls).toEqual(['space:p', 'space:new']);
  });
});
