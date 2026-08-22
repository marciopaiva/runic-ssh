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
