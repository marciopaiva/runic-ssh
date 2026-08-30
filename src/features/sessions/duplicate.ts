/**
 * Whether a draft's connection target already exists under another name.
 *
 * Mirrors `config::sessions::duplicate_of`, which is what actually refuses.
 * This is the form saying so before a round trip has to, the same relation
 * `jump.ts` already has with `check_proxy_jump`.
 */

import type { Session } from '../../ipc';

/**
 * The saved session already reaching this exact host, port, user and jump
 * host, if there is one.
 *
 * Case-insensitive on the host, the way a hostname is looked up; exact on
 * the port and the user, because two accounts on the same machine are two
 * different ways in and neither refuses the other. `null` port skips the
 * check rather than matching everything: a draft whose port has not been
 * typed as a number yet has nothing to compare.
 *
 * The jump host matters for the same reason the port and user do: the same
 * target direct and through a bastion are not the same way in, and neither
 * are the same target through two different bastions, which is a real
 * redundant-path pattern rather than the copy-paste mistake this check
 * exists to catch. `proxyJump` is the draft's own shape, `''` for none,
 * normalised here the same way `session.proxyJump`'s `undefined`-or-`null`
 * already is.
 */
export function duplicateOf(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
  host: string,
  port: number | null,
  user: string,
  proxyJump: string,
): Session | null {
  if (port === null) return null;

  const wantedHost = host.trim().toLowerCase();
  const wantedUser = user.trim();
  const wantedJump = proxyJump.trim() === '' ? null : proxyJump.trim();

  return (
    sessions.find(
      (session) =>
        session.id !== editing &&
        session.host.trim().toLowerCase() === wantedHost &&
        session.port === port &&
        session.user.trim() === wantedUser &&
        (session.proxyJump ?? null) === wantedJump,
    ) ?? null
  );
}

/**
 * Whether a draft still reaches the same host, port and user a saved session
 * already has. ADR-0036: the wizard's own Access step uses this to decide
 * whether reopening a host needs a live retest at all, none of the three can
 * move without touching the connection a stored credential proves, so an
 * exact match on all three is what says nothing here needs proving again.
 *
 * Same normalization as `duplicateOf`, deliberately: this is the same
 * identity question asked in the opposite direction, against the one session
 * being edited rather than every other one.
 */
export function accessUnchanged(
  session: Session,
  host: string,
  port: number | null,
  user: string,
): boolean {
  if (port === null) return false;

  return (
    session.host.trim().toLowerCase() === host.trim().toLowerCase() &&
    session.port === port &&
    session.user.trim() === user.trim()
  );
}
