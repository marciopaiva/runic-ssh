/**
 * Which saved hosts may serve as a jump host.
 *
 * Mirrors `config::sessions::check_proxy_jump`, which is what actually
 * refuses. Offering only what the core will accept is what turns its three
 * refusals from a message after a save into a choice that was never there:
 * a session cannot be picked as its own jump host if it is not in the list,
 * and it cannot be pointed at a host that is itself behind one.
 *
 * The core still checks. This is the form being helpful, not the form being
 * trusted.
 */

import type { Session } from '../../ipc';

export function eligibleJumpHosts(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
): readonly Session[] {
  return sessions.filter((session) => session.id !== editing && !hasJumpHost(session));
}

/**
 * Whether a session is reached through another one.
 *
 * Absent and null both mean no, and the difference is not academic. The core
 * skips the field entirely when there is none, so what arrives for an ordinary
 * host is `undefined` and never `null`, whatever the declared type says. A
 * strict comparison against `null` here matched nothing, the select found no
 * eligible hosts, and the control was absent from the form. Every test passed:
 * they built sessions with the field written out as `null`, which is a shape
 * the core does not send.
 */
function hasJumpHost(session: Session): boolean {
  return (session.proxyJump ?? null) !== null;
}

/**
 * How a session sits in a chain, if it does at all.
 *
 * Static: both answers come from the saved list and neither needs anything to
 * be connected. That is what makes marking them cheap, and what makes it a
 * different question from #168, which is about a connection that exists right
 * now and that nothing on screen admits to.
 *
 * Both can be true at once. The core refuses a jump host that is itself behind
 * one when it is chosen, but nothing stops a host that is already serving as a
 * bastion from being given one of its own afterwards, which leaves a chain a
 * hop too long that only fails when somebody connects. Showing both marks is
 * how that becomes visible before then.
 */
export interface JumpRole {
  /** Other saved hosts are reached through this one. */
  readonly carries: boolean;
  /** This host is reached through another. */
  readonly rides: boolean;
}

export function jumpRole(session: Session, sessions: readonly Session[]): JumpRole {
  return {
    carries: sessions.some((other) => other.proxyJump === session.id),
    /* Absent and null both mean no. The core skips the field entirely for a
       host that is not behind one, so what arrives is `undefined`. */
    rides: (session.proxyJump ?? null) !== null,
  };
}
