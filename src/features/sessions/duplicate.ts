/**
 * Whether a draft's connection target already exists under another name.
 *
 * Mirrors `config::sessions::duplicate_of`, which is what actually refuses —
 * this is the form saying so before a round trip has to, the same relation
 * `jump.ts` already has with `check_proxy_jump`.
 */

import type { Session } from '../../ipc';

/**
 * The saved session already reaching this exact host, port and user, if
 * there is one.
 *
 * Case-insensitive on the host, the way a hostname is looked up; exact on
 * the port and the user, because two accounts on the same machine are two
 * different ways in and neither refuses the other. `null` port skips the
 * check rather than matching everything — a draft whose port has not been
 * typed as a number yet has nothing to compare.
 */
export function duplicateOf(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
  host: string,
  port: number | null,
  user: string,
): Session | null {
  if (port === null) return null;

  const wantedHost = host.trim().toLowerCase();
  const wantedUser = user.trim();

  return (
    sessions.find(
      (session) =>
        session.id !== editing &&
        session.host.trim().toLowerCase() === wantedHost &&
        session.port === port &&
        session.user.trim() === wantedUser,
    ) ?? null
  );
}
