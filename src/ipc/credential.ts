/**
 * Typed wrappers over the credential prompt protocol.
 *
 * ADR-0008: the core issues an opaque request id, the prompt window replies
 * with that id and the secret, and an unmatched or repeated id is refused.
 *
 * Everything here except `authenticateInteractively` is called from the
 * credential window and nowhere else. It lives in `src/ipc/` with the rest so
 * the whole privileged surface stays readable in one directory, per section 6.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/** What the prompt window renders. No secret, and nothing a host chose. */
export interface CredentialPrompt {
  readonly sessionName: string;
  readonly user: string;
  readonly host: string;
  readonly port: number;
  /** Whether this machine has anywhere to keep it. */
  readonly canRemember: boolean;
}

/**
 * What became of a credential the user asked to keep.
 *
 * Returned rather than discarded, which is the whole of #167: a keychain that
 * refuses must not undo a connection that worked, and the old code was right
 * about that and then said nothing.
 *
 * `refused` covers a locked keyring, a revoked permission, and a keychain that
 * went away while the application was open. None of those make `canRemember`
 * false, so the tick box is offered and the "no credential store" copy does not
 * apply either.
 */
export type Keeping = 'notAsked' | 'kept' | 'refused';

/**
 * Opens the prompt, waits for it, and authenticates with the answer.
 *
 * Rejects with `credentialDismissed` when the user cancels or closes the
 * window. That is a cancellation, not a failure, and the interface says so.
 *
 * Resolving says what happened to the credential, never what it was.
 */
export async function authenticateInteractively(handle: SessionHandle): Promise<Keeping> {
  return invoke<Keeping>('authenticate_interactively', { handle });
}

export async function credentialPrompt(request: number): Promise<CredentialPrompt> {
  return invoke<CredentialPrompt>('credential_prompt', { request });
}

/**
 * Sends what the user typed.
 *
 * The secret goes straight to the core and is never held anywhere on this
 * side. It is read from the form at the moment of submitting, and this window
 * is destroyed immediately afterwards.
 */
export async function submitCredential(
  request: number,
  secret: { readonly password: string } | { readonly privateKey: string; readonly passphrase: string | null },
  remember: boolean,
): Promise<void> {
  return invoke<void>('submit_credential', {
    request,
    password: 'password' in secret ? secret.password : null,
    privateKey: 'privateKey' in secret ? secret.privateKey : null,
    passphrase: 'privateKey' in secret ? secret.passphrase : null,
    remember,
  });
}

/**
 * Cancels, and closes the window.
 *
 * The request is optional because the window's error state is reached exactly
 * when it could not find its request — and a Cancel that needs one is inert in
 * the only state where it is the last thing left.
 */
export async function dismissCredential(request: number | null): Promise<void> {
  return invoke<void>('dismiss_credential', { request });
}
