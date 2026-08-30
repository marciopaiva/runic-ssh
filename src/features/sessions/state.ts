/**
 * What a session looks like right now.
 *
 * The rule this file exists for: **state is never carried by colour alone**.
 * Roughly one man in twelve cannot separate the red from the green, a terminal
 * is a thing people use in bright sunlight and at two in the morning, and a
 * screenshot pasted into a ticket is often greyscale. So every state differs by
 * *shape* first — filled, outlined, or a glyph — and the colour is a second
 * signal on top of a distinction that already works without it.
 */

import type { Session, SessionHandle } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

export type ConnectionKind =
  | 'connected'
  | 'connecting'
  /** Not open itself, but a session behind it is riding it. See `carried.ts`. */
  | 'carrying'
  | 'saved'
  | 'keyMismatch'
  | 'unreachable';

/** How the marker is drawn. Distinct per state, before any colour is applied. */
export type MarkerShape =
  | 'filled'
  | 'outlined'
  | 'halo'
  | 'passing'
  | 'warning'
  | 'crossed';

export interface ConnectionState {
  readonly kind: ConnectionKind;
  /** What distinguishes it with the colour removed. */
  readonly shape: MarkerShape;
  /** The token class for the colour, which is the *second* signal. */
  readonly tone: string;
  /**
   * Read aloud, and shown on hover.
   *
   * Parameterless by type: the label is chosen at runtime, and a message that
   * needed a parameter would render `{something}` to a user with no call site
   * to catch it.
   */
  readonly label: ParameterlessKey;
}

const STATES: Readonly<Record<ConnectionKind, ConnectionState>> = {
  connected: {
    kind: 'connected',
    shape: 'filled',
    tone: 'text-ok',
    label: 'session.state.connected',
  },
  connecting: {
    kind: 'connecting',
    shape: 'halo',
    tone: 'text-warn',
    label: 'session.state.connecting',
  },
  /* A bastion with no tab, carrying somebody else's session. The connection
     to it is open and authenticated, which is why this is not `saved`: a host
     the application is logged in to must not be drawn as one it has never
     touched. #168. */
  carrying: {
    kind: 'carrying',
    shape: 'passing',
    tone: 'text-accent',
    label: 'session.state.carrying',
  },
  saved: {
    kind: 'saved',
    shape: 'outlined',
    tone: 'text-ink-disabled',
    label: 'session.state.saved',
  },
  keyMismatch: {
    kind: 'keyMismatch',
    shape: 'warning',
    tone: 'text-danger',
    label: 'session.state.keyMismatch',
  },
  unreachable: {
    kind: 'unreachable',
    shape: 'crossed',
    tone: 'text-ink-faint',
    label: 'session.state.unreachable',
  },
};

export function describeState(kind: ConnectionKind): ConnectionState {
  return STATES[kind];
}

export const ALL_STATES: readonly ConnectionState[] = Object.values(STATES);

/** What the sidebar knows about a session beyond what is saved on disk. */
export interface LiveSession {
  readonly session: Session;
  readonly handle: SessionHandle | null;
  readonly kind: ConnectionKind;
}

/** A heading and the sessions under it, in the order the file lists them. */
export interface SessionGroup {
  /** `null` for sessions with no group of their own. */
  readonly name: string | null;
  readonly sessions: readonly LiveSession[];
}

/**
 * Groups sessions for display.
 *
 * Groups keep the order in which they first appear rather than being sorted:
 * the file is the user's arrangement, and re-ordering it under them is the
 * kind of helpfulness nobody asked for. Ungrouped sessions go last, because a
 * heading-less run in the middle reads as a rendering bug.
 */
export function groupSessions(sessions: readonly LiveSession[]): readonly SessionGroup[] {
  const named = new Map<string, LiveSession[]>();
  const ungrouped: LiveSession[] = [];

  for (const live of sessions) {
    const group = live.session.group;
    if (group === null || group === undefined || group.trim() === '') {
      ungrouped.push(live);
      continue;
    }

    const existing = named.get(group);
    if (existing === undefined) {
      named.set(group, [live]);
    } else {
      existing.push(live);
    }
  }

  const groups: SessionGroup[] = [...named.entries()].map(([name, items]) => ({
    name,
    sessions: items,
  }));

  if (ungrouped.length > 0) {
    groups.push({ name: null, sessions: ungrouped });
  }

  return groups;
}

/**
 * The key one group is known by, on screen and in `solo` below.
 *
 * The one string a heading-less run of sessions has to answer to, so a
 * React `key` and a click target agree on what "this group" means without
 * each inventing its own placeholder for the same `null`.
 */
export const UNGROUPED_KEY = 'ungrouped';

export function groupKey(group: SessionGroup): string {
  return group.name ?? UNGROUPED_KEY;
}

/**
 * Which sessions still answer a name search.
 *
 * By name alone, on the maintainer's own ask: a hundred saved hosts is the
 * scale this stops being optional at, and a host is found here by what it is
 * called, not by the address behind it, which somebody typing a search
 * mostly does not have memorised. A group left with nothing to show drops
 * out entirely rather than staying as a heading over an empty list.
 */
export function filterGroups(groups: readonly SessionGroup[], query: string): readonly SessionGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return groups;

  return groups
    .map((group) => ({
      ...group,
      sessions: group.sessions.filter((live) => live.session.name.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.sessions.length > 0);
}

/**
 * Everything but the one group asked to be alone.
 *
 * `null` means nobody asked, which is most of the time and is why this
 * returns the same array reference then: a hundred hosts is exactly the
 * scale where re-filtering an unchanged list on every render is wasted work,
 * not a hundred rows' worth of wasted work either, but no reason to pay it
 * for a feature that is off.
 */
export function soloGroup(
  groups: readonly SessionGroup[],
  solo: string | null,
): readonly SessionGroup[] {
  if (solo === null) return groups;

  return groups.filter((group) => groupKey(group) === solo);
}
