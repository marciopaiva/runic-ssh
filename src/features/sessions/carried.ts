/**
 * Which saved hosts are carrying somebody else's connection right now.
 *
 * A session behind a bastion opens a second connection, to the bastion, which
 * is authenticated and which nothing on screen used to admit existed: no tab,
 * no marker, no line anywhere. The bastion's row said "saved, not connected"
 * while the application was logged in to it. That is #168, and this file is
 * the half of the answer the sidebar reads.
 *
 * The fact is **captured when a session opens** and never recomputed from the
 * saved list afterwards. Deriving it from `proxyJump` was the obvious way and
 * is wrong in both directions: take the jump host off a connected session and
 * the bastion stops being marked while it is still carrying the traffic; give
 * one to a session that is already open directly and the bastion gets marked
 * while carrying nothing. Both are the same defect this issue is about, in a
 * narrower window.
 */

import type { Session } from '../../ipc';

import type { ConnectionKind, LiveSession } from './state';

/** The host a session is carried on, as it was when the session opened. */
export interface CarriedOn {
  readonly bastionId: string;
  /** What the core called it at the time. A fallback, not the display name. */
  readonly name: string;
}

/**
 * Whether a state may be replaced by `carrying`.
 *
 * Three of the five must not be. `connected` and `connecting` are about the
 * bastion's own session and already say a connection exists, which is the
 * whole complaint; overwriting them would trade one silence for another.
 * `keyMismatch` is a security state, and covering a blocked host key with a
 * livelier marker is the one substitution that could get somebody hurt.
 *
 * `unreachable` is replaced, and that is not an oversight. It is the verdict
 * of an earlier attempt to open the host directly, and a bastion currently
 * carrying a session is demonstrably reachable. Leaving it would be the screen
 * asserting something the connection disproves.
 */
function mayBeReplaced(kind: ConnectionKind): boolean {
  return kind === 'saved' || kind === 'unreachable';
}

/**
 * Marks the hosts that other open sessions are riding.
 *
 * Only sessions that still hold a handle count, so an entry left behind by a
 * session that has since closed marks nothing. That is why the caller may
 * forget to remove one without the sidebar telling a lie about it.
 */
export function markCarried(
  sessions: readonly LiveSession[],
  carriedOn: ReadonlyMap<string, CarriedOn>,
): readonly LiveSession[] {
  const carrying = new Set<string>();
  for (const live of sessions) {
    if (live.handle === null) continue;
    const carried = carriedOn.get(live.session.id);
    if (carried !== undefined) carrying.add(carried.bastionId);
  }

  if (carrying.size === 0) return sessions;

  return sessions.map((live) =>
    carrying.has(live.session.id) && mayBeReplaced(live.kind)
      ? { ...live, kind: 'carrying' }
      : live,
  );
}

/**
 * What to call the host a session is carried on.
 *
 * The saved list first, so renaming a bastion renames it everywhere at once.
 * The name the core reported is the fallback for the one case the list cannot
 * answer: the host was deleted while a session was still riding it, and the
 * connection is still there to be named.
 */
export function carrierName(sessions: readonly Session[], carried: CarriedOn): string {
  return sessions.find((session) => session.id === carried.bastionId)?.name ?? carried.name;
}
