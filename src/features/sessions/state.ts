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
  | 'saved'
  | 'keyMismatch'
  | 'unreachable';

/** How the marker is drawn. Distinct per state, before any colour is applied. */
export type MarkerShape = 'filled' | 'outlined' | 'halo' | 'warning' | 'crossed';

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
