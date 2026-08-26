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

/**
 * What the editor may offer for "reached through", and why.
 *
 * `eligibleJumpHosts` answers the question from one side: which saved hosts
 * are usable as a bastion. This answers it from the other, which is the side
 * #171 was about: a host that other sessions are already reached through
 * cannot be given a jump host of its own, because that is their chain made two
 * hops long by editing a host they do not appear on.
 *
 * The core refuses it either way (`config::sessions::check_not_serving`). What
 * this is for is the form, which should not offer a choice that will be
 * refused, and should say whose connection is at stake rather than only saying
 * no.
 */
export interface JumpHostChoice {
  /** The hosts to offer, in order. Empty means the control has nothing to show. */
  readonly offered: readonly Session[];
  /**
   * The saved hosts reached through the one being edited.
   *
   * Non-empty means no jump host may be chosen, and these are the names the
   * message needs: "no" alone leaves somebody to work out which of their hosts
   * they are being protected from breaking.
   */
  readonly carried: readonly Session[];
}

export function jumpHostChoice(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
  /** The id currently in the field, empty for none. */
  chosen: string,
): JumpHostChoice {
  const carried = editing === null ? [] : sessions.filter((other) => other.proxyJump === editing);

  if (carried.length === 0) {
    return { offered: eligibleJumpHosts(sessions, editing), carried };
  }

  /* A host in this state can already be in the file: the check is new and the
     sessions are not. Offering the value it holds, and nothing else, is what
     leaves a way to clear it. Offering the eligible list instead would be a
     form contradicting its own message, and offering nothing at all would make
     a session saved before this check unfixable from the editor. */
  const current = sessions.find((session) => session.id === chosen);

  return { offered: current === undefined ? [] : [current], carried };
}
