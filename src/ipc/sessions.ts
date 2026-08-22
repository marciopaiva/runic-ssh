/**
 * Typed wrapper over the session commands.
 *
 * `invoke` appears only in this directory, so the whole IPC surface reads in
 * one place. A component never calls the core directly.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * An opaque reference to a live connection.
 *
 * A number with no meaning outside the core. It names no host, carries no
 * credential, and is not a capability — see `src-tauri/src/ssh/registry.rs`.
 */
export type SessionHandle = number;

/** A saved session. Names a host; never holds a secret. */
export interface Session {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly group: string | null;
  /**
   * The keychain entry holding this session's secret, if one was saved.
   *
   * An opaque id and nothing more: the frontend can name a credential, and can
   * never read one. See ADR-0004.
   */
  readonly credentialId: string | null;
}

/**
 * What the interface sends when saving.
 *
 * There is deliberately no field for a secret. The type has nowhere to put
 * one, so a password cannot reach the session file even by mistake.
 */
export interface SessionDraft {
  /** Absent when creating; present when editing the session it names. */
  readonly id?: string;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly group?: string | null;
}

export async function listSessions(): Promise<readonly Session[]> {
  return invoke<Session[]>('list_sessions');
}

/**
 * Creates or replaces a session, returning what was stored.
 *
 * The id comes back from the core rather than being chosen here: one invented
 * by the interface that happened to collide would silently overwrite somebody
 * else's session.
 */
export async function saveSession(draft: SessionDraft): Promise<Session> {
  return invoke<Session>('save_session', { draft });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return invoke<void>('delete_session', { sessionId });
}

export interface OpenSession {
  readonly handle: SessionHandle;
  readonly sessionId: string;
  readonly name: string;
  /** Whether the connection still needs a credential before it is usable. */
  readonly authenticated: boolean;
}

/**
 * Opens a connection and verifies the host key.
 *
 * Returns *before* authentication. A host key that is not already trusted
 * rejects here, with a `hostKeyRejected` error naming which of the five
 * outcomes it was — there is no path that proceeds on an untrusted key.
 */
export async function connectSession(sessionId: string): Promise<OpenSession> {
  return invoke<OpenSession>('connect_session', { sessionId });
}

/**
 * The secret to prove who we are.
 *
 * Exactly one of `password` or `privateKey`. The core refuses both and refuses
 * neither rather than guessing, because guessing means telling the user the
 * wrong thing when it fails.
 *
 * Nothing of this is stored on this side of the boundary. It is built at the
 * moment of submission and discarded — see ADR-0008.
 */
export type Secret =
  | { readonly password: string }
  | { readonly privateKey: string; readonly passphrase?: string };

export async function authenticateSession(
  handle: SessionHandle,
  secret: Secret,
): Promise<void> {
  const payload =
    'password' in secret
      ? { handle, password: secret.password, privateKey: null, passphrase: null }
      : {
          handle,
          password: null,
          privateKey: secret.privateKey,
          passphrase: secret.passphrase ?? null,
        };

  return invoke<void>('authenticate_session', payload);
}

export async function disconnectSession(handle: SessionHandle): Promise<void> {
  return invoke<void>('disconnect_session', { handle });
}
