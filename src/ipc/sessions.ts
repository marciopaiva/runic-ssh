/**
 * Typed wrapper over the session commands.
 *
 * `invoke` appears only in this directory, so the whole IPC surface reads in
 * one place. A component never calls the core directly.
 */

import { invoke } from '@tauri-apps/api/core';

import type { Hop } from './errors';

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
  /**
   * The saved session this host is reached through, if it is behind one.
   *
   * An id rather than an address: a bastion is a host in its own right, with
   * its own key to verify and its own credential. See ADR-0023.
   */
  readonly proxyJump: string | null;
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
  /** The id of the saved session to reach this host through. */
  readonly proxyJump?: string | null;
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
  /**
   * The name of the bastion this session is carried on, if there is one.
   *
   * Absent for an ordinary connection. Which machine the keystrokes travel
   * through is a fact about the session, and somebody who does not know it is
   * happening cannot reason about it.
   */
  readonly via?: string;
}

/**
 * Opens a connection and verifies the host key.
 *
 * Returns *before* authentication. A host key that is not already trusted
 * rejects here, with a `hostKeyRejected` error naming which of the five
 * outcomes it was — there is no path that proceeds on an untrusted key.
 */
export async function connectSession(
  sessionId: string,
  /**
   * The host key decision this attempt is continuing, when it is a retry.
   *
   * Accepting a key means writing it down and connecting again, because the
   * transport has no "accept for this session" path. For a chained session that
   * rebuilds the whole chain, jump host included, and naming the decision is
   * what lets the core reuse the answer already given for that hop rather than
   * asking for it a second time. See ADR-0027.
   */
  continuing?: number,
): Promise<OpenSession> {
  return invoke<OpenSession>('connect_session', {
    sessionId,
    continuing: continuing ?? null,
  });
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

/**
 * Accepts a host key the user was shown.
 *
 * Takes the id of a refusal the core is holding — not a host and a key. The
 * interface can answer a decision it was shown and cannot describe one it
 * would like made, which is what keeps rule 3's deliberate override from
 * becoming a boolean somebody passes `true` to.
 *
 * `confirmation` is the host name typed back, required for a changed key and
 * checked by the core rather than here.
 */
export async function trustHostKey(
  pendingId: number,
  confirmation?: string,
): Promise<void> {
  return invoke<void>('trust_host_key', {
    pendingId,
    confirmation: confirmation ?? null,
  });
}

/**
 * Drops a decision the user walked away from.
 *
 * Cancelling used to reach the core not at all, and the entry sat there until
 * the process ended. Since ADR-0027 a decision can be holding the credential
 * typed for a jump host, and a secret the user asked us not to keep must not
 * outlive the attempt they abandoned.
 */
export async function dismissHostKey(pendingId: number): Promise<void> {
  return invoke<void>('dismiss_host_key', { pendingId });
}

/** Whether this machine can remember a credential at all. */
export type CredentialStoreStatus =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Asks before offering to save anything.
 *
 * Someone on a machine with no secret service should be told up front, not
 * after typing a password into a checkbox that could never have worked.
 */
export async function credentialStoreStatus(): Promise<CredentialStoreStatus> {
  return invoke<CredentialStoreStatus>('credential_store_status');
}

/** Remembers a session's secret. The value passes through and is gone. */
export async function rememberCredential(
  sessionId: string,
  secret: Secret,
): Promise<void> {
  const payload =
    'password' in secret
      ? { sessionId, password: secret.password, privateKey: null, passphrase: null }
      : {
          sessionId,
          password: null,
          privateKey: secret.privateKey,
          passphrase: secret.passphrase ?? null,
        };

  return invoke<void>('remember_credential', payload);
}

export async function forgetCredential(sessionId: string): Promise<void> {
  return invoke<void>('forget_credential', { sessionId });
}

/**
 * Authenticates with the credential saved for this session.
 *
 * Names the session and nothing else. The secret is resolved in the core, used
 * and wiped — it never crosses toward the webview, which is rule 1 and the
 * reason the vault exists at all.
 */
export async function authenticateWithSaved(handle: SessionHandle): Promise<void> {
  return invoke<void>('authenticate_with_saved', { handle });
}

export async function disconnectSession(handle: SessionHandle): Promise<void> {
  return invoke<void>('disconnect_session', { handle });
}

/** What the host key screens need to render. */
export interface HostKeyDecisionView {
  readonly host: string;
  readonly port: number;
  readonly keyType: string;
  /**
   * Which host in a chain this is asking about.
   *
   * The screen has to say so. Two fingerprint prompts in a row, for two
   * different hosts, are the same prompt to anybody not told which is which,
   * and the one that gets read is the one rule 3 depends on.
   */
  readonly hop: Hop;
  readonly verdict: 'unknown' | 'changed' | 'revoked' | 'certificateRequired';
  /** The fingerprint the host offered. */
  readonly offered: string;
  /** The fingerprints already trusted for this host, if any. */
  readonly stored: readonly string[];
}

/**
 * Describes a host key decision the core is holding.
 *
 * Read by id rather than carried on the error: the prompt wants the key type
 * and the port as well as the fingerprint.
 */
export async function hostKeyDecision(pendingId: number): Promise<HostKeyDecisionView> {
  return invoke<HostKeyDecisionView>('host_key_decision', { pendingId });
}
