/**
 * Where commands come from.
 *
 * Pure functions of the application's state, so what the palette will offer
 * can be asserted without opening it. Each source translates its own titles:
 * it is the part that knows what the command means, and the palette only ranks
 * and draws.
 *
 * A command is only built when it can actually run. An entry that reports its
 * own unavailability is worse than an absent one — it costs a keystroke, a
 * read and a disappointment, in a list whose whole value is that everything in
 * it works.
 */

import type { Translator } from '../../lib/i18n';
import type { LocalShellKind, Macro, Space } from '../../ipc';
import { groupSessions, hostRows } from '../sessions';
import type { LiveSession } from '../sessions';
import { localShellKindId, localShellLabel } from '../terminal';

import type { Command } from './registry';

export interface CommandActions {
  /**
   * Puts a saved host where the workspace beside the button that opened this
   * palette is standing: the focused rectangle in Sessions, or the fan-out
   * slot last clicked in SFTP (ADR-0072).
   */
  readonly openHostInto: (sessionId: string) => void;
  /** SFTP's own endpoint with no host behind it, into that same slot. */
  readonly openLocalInto: () => void;
  /** Opens a native shell of the given kind into the same slot (ADR-0074). */
  readonly openLocalShellInto: (kind: LocalShellKind) => void;
  /** Switches workspace pill. */
  readonly goTo: (workspace: 'home' | 'sessions' | 'sftp') => void;
  readonly toggleMacros: () => void;
  readonly toggleHosts: () => void;
  /** Brings a Space in front. The default Space is the empty string. */
  readonly switchSpace: (id: string) => void;
  readonly newSpace: () => void;
  /** Opens the preview that offers the groups as Spaces. */
  readonly importGroups: () => void;
  /** Opens the host's files in SFTP, in the slot last used. */
  readonly openFilesOf: (sessionId: string) => void;
  /**
   * Runs a saved macro. With an empty scope it goes to the session in front,
   * as the macros sidebar does. With hosts in the scope it opens the fleet run
   * dialog on them, which lists the targets before anything is sent.
   */
  readonly runMacro: (macro: Macro, scope: readonly string[]) => void;
}

export interface CommandContext {
  readonly i18n: Translator;
  readonly sessions: readonly LiveSession[];
  readonly actions: CommandActions;
  /**
   * Which workspace pill is showing, for `hostBookCommands`: it decides
   * whether "this machine" belongs in the list at all.
   */
  readonly workspace: 'home' | 'sessions' | 'sftp';
  readonly macros: readonly Macro[];
  /** Whether a session is in front for a macro to go to. */
  readonly hasTarget: boolean;
  /** How many groups the import would turn into Spaces. Zero hides the row. */
  readonly importable: number;
  readonly spaces: readonly Space[];
  /** The Space in front. */
  readonly activeSpace: string;
  readonly macrosOpen: boolean;
  readonly hostsOpen: boolean;
  /** The shells this platform offers, detected once at startup (ADR-0074). */
  readonly localShellKinds: readonly LocalShellKind[];
}

/**
 * The saved host book, for the "+" beside the ADR-0072 pills.
 *
 * Grouped by `session.group` (`groupSessions`, the same field Home's editor
 * already writes), ungrouped hosts last under `sessions.ungrouped`: a flat
 * list stopped being readable once a fleet grew past a screenful, and this
 * is the field that already exists for it rather than a new one invented for
 * the palette alone. Bastion nesting (ADR-0060, `hostRows`) still applies,
 * but only within one group's own hosts; a bastion and a rider filed under
 * different groups is not nested here, which is a real limitation of asking
 * one field to carry both hierarchies at once, not something this tries to
 * hide. Every row opens into whichever slot the button beside it stands for,
 * `openHostInto` deciding what that means for the workspace showing; the "+"
 * is how the fan-out gets an occupant now that the SFTP sidebar's own pinned
 * "this machine" row is gone with it.
 *
 * Creating a host is not offered here: this "+" places an existing one, and
 * Home's own row and the hosts-manager sidebar's "+" are already where that
 * starts (ADR-0076; the general keyboard palette stopped offering its own
 * `session:new` for the same reason).
 */
export function hostBookCommands(context: CommandContext): readonly Command[] {
  const { i18n, sessions, workspace, actions } = context;

  const commands: Command[] = groupSessions(sessions).flatMap((group) => {
    const heading = group.name ?? i18n.t('sessions.ungrouped');

    return hostRows(group.sessions).map(({ live }) => {
        const { session } = live;
        return {
          id: `hostbook:${session.id}`,
          section: 'sessions' as const,
          title: session.name,
          detail: `${session.user}@${session.host}`,
          sigil: { id: session.id, live: live.kind === 'connected' },
          keywords: [session.host, session.user, session.group ?? ''].filter((word) => word !== ''),
          group: heading,
          role: 'host' as const,
          subject: session.id,
          hint: hostHint(i18n, session, sessions),
          run: () => actions.openHostInto(session.id),
        };
      });
  });

  if (workspace === 'sftp') {
    /* The same label the pinned sidebar row used to carry (`sftp.localhost`),
       and the one a pane already shows once this is dropped into it: this
       row replaces that one rather than naming the same endpoint twice. No
       `group`: it is not a saved host to file under one. */
    commands.unshift({
      id: 'hostbook:local',
      section: 'sessions',
      title: i18n.t('sftp.localhost'),
      keywords: ['local', 'localhost'],
      run: actions.openLocalInto,
    });
  }

  return commands;
}

/**
 * The native shells this platform can open, for the same "+" the host book
 * uses (ADR-0074).
 *
 * Gated the same way `hostBookCommands`'s own `hostbook:local` row is:
 * a local shell is a terminal session like any other, so it belongs beside
 * the saved hosts in Sessions, not in SFTP, whose "+" places file
 * endpoints rather than sessions.
 *
 * Titled `sftp.localhost` rather than "Open <kind>": every other row in this
 * palette is a name over a `user@host` detail, and a shell hiding behind a
 * verb was the one row that did not read like the host it opens.
 *
 * Grouped under `local.group` only once there is more than one: a single
 * shell (the common case outside Windows, where `detect()` only ever offers
 * `DefaultShell`) needs no heading of its own, but Windows can offer
 * PowerShell, Command Prompt and a WSL distro side by side, and at that
 * point they read as a list that needs the same kind of heading a host
 * group gets, not three unrelated rows.
 *
 * Placed ahead of `hostBookCommands` in `App.tsx`'s own source list, so this
 * always opens at the top: a local shell needs nothing saved to exist,
 * unlike every row below it.
 */
export function localShellCommands(context: CommandContext): readonly Command[] {
  const { i18n, workspace, localShellKinds, actions } = context;
  if (workspace === 'sftp') return [];

  const grouped = localShellKinds.length > 1;

  return localShellKinds.map((kind) => ({
    id: `local:${localShellKindId(kind)}`,
    section: 'sessions' as const,
    title: i18n.t('sftp.localhost'),
    detail: localShellLabel(kind, i18n),
    keywords: ['local', 'shell', 'terminal'],
    ...(grouped ? { group: i18n.t('local.group') } : {}),
    run: () => actions.openLocalShellInto(kind),
  }));
}

/** What is saved about a host, in one line. Names a credential only as saved or
 * not: the Bar never reads one. */
function hostHint(
  i18n: Translator,
  session: LiveSession['session'],
  all: readonly LiveSession[],
): string {
  const parts = [
    `${session.user}@${session.host}:${session.port}`,
    i18n.t((session.credentialId ?? null) === null ? 'bar.hint.login.none' : 'bar.hint.login.saved'),
  ];
  /* The core leaves an unset field out of the file, so what arrives here is
     `undefined` as often as `null`, whatever the type says. */
  const jumpId = session.proxyJump ?? null;
  if (jumpId !== null) {
    /* `proxyJump` holds the bastion's id, which is no use to read. The name it
       has in the host book is, and an id that names nothing saved says so
       rather than printing the id. */
    const jump = all.find((live) => live.session.id === jumpId)?.session.name;
    parts.push(i18n.t('bar.hint.jump', { jump: jump ?? i18n.t('bar.hint.jumpMissing') }));
  }
  return parts.join(' · ');
}

/**
 * What the Bar can do besides opening a host.
 *
 * Only what runs without a question: switching workspace and the two side
 * panels. Each row is offered only when it would change something, in the
 * spirit of the rest of this file.
 */
export function actionCommands(context: CommandContext): readonly Command[] {
  const { i18n, workspace, actions, macrosOpen, hostsOpen } = context;

  const pills = [
    { id: 'home', label: i18n.t('toolbar.pills.home') },
    { id: 'sessions', label: i18n.t('toolbar.pills.ssh') },
    { id: 'sftp', label: i18n.t('toolbar.pills.sftp') },
  ] as const;

  const commands: Command[] = pills
    .filter((pill) => pill.id !== workspace)
    .map((pill) => ({
      id: `action:go:${pill.id}`,
      section: 'actions' as const,
      title: i18n.t('bar.action.go', { name: pill.label }),
      keywords: [pill.id],
      run: () => actions.goTo(pill.id),
    }));

  commands.push({
    id: 'action:macros',
    section: 'actions',
    title: i18n.t(macrosOpen ? 'toolbar.macros.hide' : 'toolbar.macros.show'),
    keywords: ['macros', 'snippets'],
    run: actions.toggleMacros,
  });

  /* Only once there is something to switch between, and never to the Space
     already in front. */
  if (context.spaces.length > 0) {
    const choices = [
      { id: '', name: i18n.t('spaces.default') },
      ...context.spaces.map((space) => ({ id: space.id, name: space.name })),
    ].filter((choice) => choice.id !== context.activeSpace);

    for (const choice of choices) {
      commands.push({
        id: `action:space:${choice.id || 'default'}`,
        section: 'actions',
        title: i18n.t('spaces.switch', { name: choice.name }),
        keywords: ['space', choice.name],
        run: () => actions.switchSpace(choice.id),
      });
    }
  }
  if (context.importable > 0) {
    commands.push({
      id: 'action:space:import',
      section: 'actions',
      title: i18n.t('spaces.import.action'),
      keywords: ['space', 'group', 'import'],
      run: actions.importGroups,
    });
  }
  commands.push({
    id: 'action:space:new',
    section: 'actions',
    title: i18n.t('spaces.new'),
    keywords: ['space', 'environment'],
    run: actions.newSpace,
  });

  if (workspace === 'sessions') {
    commands.push({
      id: 'action:hosts',
      section: 'actions',
      title: i18n.t(hostsOpen ? 'toolbar.hosts.hide' : 'toolbar.hosts.show'),
      keywords: ['hosts', 'servers'],
      run: actions.toggleHosts,
    });
  }

  return commands;
}

/**
 * Saved macros, for `>`.
 *
 * Saved macros only, never free text: the Bar does not send a string it
 * composed (ADR-0078). With hosts in the scope only script macros are listed,
 * because those are the ones the fleet run accepts, and the run opens the
 * target list before sending anything.
 */
export function macroCommands(context: CommandContext, scope: readonly string[]): readonly Command[] {
  const { i18n, macros, actions, hasTarget } = context;

  /* Without hosts in the scope a macro goes to the session in front, so with
     none in front there is nowhere for it to go and it is not offered. */
  if (scope.length === 0 && !hasTarget) return [];

  return macros
    .filter((macro) => scope.length === 0 || macro.kind === 'script')
    .map((macro) => ({
      id: `macro:${macro.id}`,
      section: 'snippets' as const,
      title: macro.name,
      detail: i18n.t(macro.kind === 'script' ? 'bar.macro.script' : 'bar.macro.sequential'),
      role: 'macro' as const,
      run: () => actions.runMacro(macro, scope),
    }));
}

/**
 * Hosts whose files can be opened, for `/`. Hosts already in the scope come
 * first, since that is what the chips are for.
 */
export function fileCommands(context: CommandContext, scope: readonly string[]): readonly Command[] {
  const { i18n, sessions, actions } = context;
  const scoped = new Set(scope);
  const ordered = [...sessions].sort(
    (a, b) => Number(scoped.has(b.session.id)) - Number(scoped.has(a.session.id)),
  );

  return ordered.map(({ session }) => ({
    id: `files:${session.id}`,
    section: 'sessions' as const,
    title: session.name,
    detail: `${session.user}@${session.host}`,
    keywords: [session.host, session.user],
    role: 'files' as const,
    subject: session.id,
    hint: hostHint(i18n, session, sessions),
    run: () => actions.openFilesOf(session.id),
  }));
}
