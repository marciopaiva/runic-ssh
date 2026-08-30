/**
 * Typed wrappers over the credential prompt protocol.
 *
 * ADR-0008: the core issues an opaque request id, the prompt window replies
 * with that id and the secret, and an unmatched or repeated id is refused.
 *
 * Most of this is called from the credential window and nowhere else. Two are
 * not: `authenticateInteractively`, which is how the main window asks for a
 * prompt to exist, and `dismissCredential`, which is how it takes one away
 * again when the user cancels the attempt underneath it. It lives in
 * `src/ipc/` with the rest so the whole privileged surface stays readable in
 * one directory, per section 6.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

import type { SessionHandle } from './sessions';

/** Which kind of credential a host is expected to take. Not a secret. */
export type SuggestedMethod = 'password' | 'privateKey';

/** What the prompt window renders. No secret, and nothing a host chose. */
export interface CredentialPrompt {
  readonly sessionName: string;
  readonly user: string;
  readonly host: string;
  readonly port: number;
  /** Whether this machine has anywhere to keep it. */
  readonly canRemember: boolean;
  /**
   * The session this hop is being crossed for, when this is a jump host.
   *
   * `null` is an ordinary prompt for the host the user clicked. A name means
   * the window is asking about a machine the user did not name, on the way to
   * one they did. ADR-0023 refused to let a jump host prompt at all until this
   * could be said, so rendering it is not optional.
   */
  readonly carrying: string | null;
  /**
   * A credential kind chosen before this prompt was asked for, if any.
   *
   * ADR-0030: the editor's own "save & test" already knows which kind of
   * credential the host takes, chosen on the plain form rather than typed
   * here. `null` for every ordinary connect, which is what makes the window
   * fall back to its own default.
   */
  readonly suggestedMethod: SuggestedMethod | null;
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
 * How long the user asked for a credential to be kept.
 *
 * Three answers rather than a boolean. "Until I say otherwise" and "ask me
 * every time" leave out the afternoon somebody is working, which is what most
 * people want and the only one a machine with no keychain can give. ADR-0025.
 *
 * `forThisRun` is written nowhere: the core holds it until the application
 * closes, and the control says so, because there is no second chance to
 * explain it after a restart.
 */
export type Keep = 'never' | 'forThisRun' | 'stored';

/**
 * Opens the prompt, waits for it, and authenticates with the answer.
 *
 * Rejects with `credentialDismissed` when the user cancels or closes the
 * window. That is a cancellation, not a failure, and the interface says so.
 *
 * Resolving says what happened to the credential, never what it was.
 */
export async function authenticateInteractively(
  handle: SessionHandle,
  suggestedMethod?: SuggestedMethod,
): Promise<Keeping> {
  return invoke<Keeping>('authenticate_interactively', {
    handle,
    suggestedMethod: suggestedMethod ?? null,
  });
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
  keep: Keep,
): Promise<void> {
  return invoke<void>('submit_credential', {
    request,
    password: 'password' in secret ? secret.password : null,
    privateKey: 'privateKey' in secret ? secret.privateKey : null,
    passphrase: 'privateKey' in secret ? secret.passphrase : null,
    keep,
  });
}

/**
 * Cancels, and closes the window.
 *
 * The request is optional because the window's error state is reached exactly
 * when it could not find its request — and a Cancel that needs one is inert in
 * the only state where it is the last thing left.
 *
 * It is also how the **main** window takes a prompt away. Passing `null` from
 * there closes whichever prompt is open, and closing it is what answers the
 * request the core is holding: the core wires the window's own destruction to a
 * dismissal, so there is no id to know and nothing left waiting. That is the
 * way out of a prompt that does not depend on the prompt's own script, which is
 * what ADR-0028 spends to take the native title bar off it.
 */
export async function dismissCredential(request: number | null): Promise<void> {
  return invoke<void>('dismiss_credential', { request });
}

/** The event `ask_inline` emits in place of opening a window. ADR-0033. */
const INLINE_CREDENTIAL_EVENT = 'credential://inline-request';

/**
 * Subscribes to a bastion's own credential being needed inline.
 *
 * Only ever fires while the wizard's own test is in flight. ADR-0033 names
 * this the reason a bare request id is enough: one attempt at a time, one
 * caller that ever asks this way. `credentialPrompt(request)` reads what to
 * show for it, the same call the window itself would have made; answering is
 * `submitCredential`, unchanged, because answering was never window-specific
 * either.
 */
export async function onInlineCredentialRequest(
  onRequest: (request: number) => void,
): Promise<UnlistenFn> {
  return listen<number>(INLINE_CREDENTIAL_EVENT, (event) => onRequest(event.payload));
}
