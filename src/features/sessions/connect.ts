/**
 * The steps between a saved host and an open session.
 *
 * Pure, so the order can be asserted without a network or a window. What this
 * file exists to pin down is that **a host key decision always comes before a
 * credential** — the client must never ask for a password on a connection whose
 * host it has not verified, because a password typed at an unverified host is a
 * password given to whoever answered.
 */

import type { IpcError, IpcErrorCode } from '../../ipc';

/** Where a connection attempt is. */
export type ConnectStage =
  | { readonly stage: 'idle' }
  | { readonly stage: 'connecting' }
  /** Waiting on the user to decide about a host key. */
  | { readonly stage: 'deciding'; readonly decision: HeldDecision }
  /** Waiting on the credential window. */
  | { readonly stage: 'authenticating' }
  | { readonly stage: 'failed'; readonly code: IpcErrorCode };

/**
 * Whether an attempt is still working, and should say so on screen.
 *
 * `deciding` is deliberately excluded: a held host key is not progress, it is a
 * question, and showing a spinner over it would say the application is busy
 * when it is in fact waiting on the user. `failed` is excluded for the same
 * reason in reverse — it is an answer, not a wait.
 */
export function isInProgress(stage: ConnectStage): boolean {
  return stage.stage === 'connecting' || stage.stage === 'authenticating';
}

/** Which host key screen a refusal calls for. */
export type HostKeyVerdict = 'unknown' | 'changed' | 'revoked' | 'certificateRequired';

/** A refusal the core is holding, as the interface needs to read it. */
export interface HeldDecision {
  readonly pending: number;
  readonly verdict: HostKeyVerdict;
}

/**
 * Reads a host key refusal out of a failure.
 *
 * The core answers a refusal with `hostKeyDecision`, wrapping the verdict, and
 * nothing else in the union means a key needs deciding. Anything that is not
 * that shape returns `null` rather than being coerced into one: a connection
 * that failed for another reason must not put a trust prompt on screen.
 */
export function heldDecision(error: IpcError): HeldDecision | null {
  if (error.code !== 'hostKeyDecision') return null;
  if (error.inner.code !== 'hostKeyRejected') return null;

  return { pending: error.pending, verdict: error.inner.verdict };
}

/**
 * Whether a verdict may be overridden by the user at all.
 *
 * Rule 3 separates these and so does this function. An unknown key prompts and
 * a changed one blocks with a typed confirmation — but revoked and
 * certificate-required have no override at all, and offering one would defeat
 * the only purpose those markers have.
 */
export function isOverridable(verdict: HostKeyVerdict): boolean {
  return verdict === 'unknown' || verdict === 'changed';
}

/**
 * Whether accepting requires typing the host name back.
 *
 * Only a changed key. Asking for it on a first connection would train people
 * to type it, which is exactly the reflex the confirmation exists to break.
 */
export function needsConfirmation(verdict: HostKeyVerdict): boolean {
  return verdict === 'changed';
}

/**
 * Whether a failed attempt is something the user chose.
 *
 * A dismissed prompt is a cancellation. Reporting it as an error puts a red
 * message on screen for someone who pressed Cancel, which teaches people to
 * ignore red messages.
 */
export function wasCancelled(code: IpcErrorCode): boolean {
  return code === 'credentialDismissed';
}

/**
 * Whether a saved credential is worth trying before prompting.
 *
 * Not when the keychain has nothing for this session, and not when it has
 * something the store cannot read — both end in the same prompt, and trying
 * first only delays it.
 */
export function shouldTrySaved(credentialId: string | null): boolean {
  return credentialId !== null;
}

/**
 * Whether a saved credential failing should fall back to asking.
 *
 * A stored secret that the host refuses is a stale password, and the answer is
 * to ask for the current one. A transport failure is not, and asking again
 * would put a prompt in front of someone whose network is down.
 */
export function shouldPromptAfterSaved(code: IpcErrorCode): boolean {
  return (
    code === 'noSavedCredential' ||
    code === 'authenticationFailed' ||
    code === 'keychainReadFailed' ||
    code === 'keychainUnavailable'
  );
}
