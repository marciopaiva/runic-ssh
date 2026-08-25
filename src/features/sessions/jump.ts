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
  return sessions.filter(
    (session) => session.id !== editing && session.proxyJump === null,
  );
}
