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
import type { ComponentKind, LocalShellKind } from '../../ipc';
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
  /**
   * Puts a saved host on the map instead: the new component `mapPlacement`
   * named, or the existing one's host pointed elsewhere (`HostPicker`'s old
   * job, now this palette's).
   */
  readonly placeHostOnMap: (sessionId: string) => void;
  /** The map's own "new host": opens the editor over the map with
      `mapPlacement`'s kind and target carried through, instead of Home's
      plain new-session editor. */
  readonly newHostForMap: () => void;
}

export interface CommandContext {
  readonly i18n: Translator;
  readonly sessions: readonly LiveSession[];
  readonly actions: CommandActions;
  /**
   * Which workspace pill is showing, for `hostBookCommands`: it decides
   * whether "this machine" belongs in the list at all.
   */
  readonly workspace: 'sessions' | 'sftp' | 'map';
  /** The shells this platform offers, detected once at startup (ADR-0074). */
  readonly localShellKinds: readonly LocalShellKind[];
  /**
   * Set only while this "+" is open to answer a request the map's own radial
   * menu made (creating a component of `kind`, or re-pointing `changing`'s
   * host): `null` everywhere else, Sessions and SFTP included, since nothing
   * outside that gesture ever sets it. `hostBookCommands` reads it to hide a
   * host already carrying a component of that kind (`HostPicker`'s old
   * `duplicate` refusal, now avoided by not offering the row) and to send a
   * pick into the map instead of a pane.
   */
  readonly mapPlacement: {
    readonly kind: ComponentKind;
    readonly changing: string | null;
    readonly layer: string | null;
    readonly blockedHostIds: ReadonlySet<string>;
  } | null;
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
 * `session:new` for the same reason). The one exception is `mapPlacement`:
 * the map's radial menu has already asked for a `kind`, and with nothing
 * else to place a new host it opens the editor from here too (below), so the
 * palette this gesture is already looking at can also start that host
 * instead of routing to the general keyboard palette.
 */
export function hostBookCommands(context: CommandContext): readonly Command[] {
  const { i18n, sessions, workspace, mapPlacement, actions } = context;

  const commands: Command[] = groupSessions(sessions).flatMap((group) => {
    const heading = group.name ?? i18n.t('sessions.ungrouped');

    return hostRows(group.sessions)
      .filter(({ live }) => mapPlacement === null || !mapPlacement.blockedHostIds.has(live.session.id))
      .map(({ live }) => {
        const { session } = live;
        return {
          id: `hostbook:${session.id}`,
          section: 'sessions' as const,
          title: session.name,
          detail: `${session.user}@${session.host}`,
          keywords: [session.host, session.user, session.group ?? ''].filter((word) => word !== ''),
          group: heading,
          run: () => (mapPlacement === null ? actions.openHostInto(session.id) : actions.placeHostOnMap(session.id)),
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

  if (workspace === 'map' && mapPlacement !== null) {
    commands.push({
      id: 'hostbook:new',
      section: 'sessions',
      title: i18n.t('command.session.newForMap'),
      keywords: ['new', 'add', 'novo', 'adicionar', 'nueva', 'host'],
      run: actions.newHostForMap,
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
 * the saved hosts in Sessions and Map, not in SFTP, whose "+" places file
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
 *
 * Hidden while `mapPlacement` is set: the map's radial menu only ever asks
 * for `'ssh'`, `'sftp'` or `'monitor'` this way, since `'local'` places
 * itself straight from `create:local` with no palette involved (ADR-0065).
 * A local shell answers none of those, so offering one here while the map is
 * asking would run `openLocalShellInto` into a Sessions tab-strip slot the
 * user is not even looking at.
 */
export function localShellCommands(context: CommandContext): readonly Command[] {
  const { i18n, workspace, localShellKinds, mapPlacement, actions } = context;
  if (workspace === 'sftp' || mapPlacement !== null) return [];

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
