/**
 * The steps between a saved host and an open session.
 *
 * Pure, so the order can be asserted without a network or a window. What this
 * file exists to pin down is that **a host key decision always comes before a
 * credential** — the client must never ask for a password on a connection whose
 * host it has not verified, because a password typed at an unverified host is a
 * password given to whoever answered.
 */

import type {
  CredentialPrompt,
  Hop,
  IpcError,
  IpcErrorCode,
  Keeping,
  Session,
  SessionHandle,
} from '../../ipc';

/**
 * What an attempt is being made for.
 *
 * The steps are the same either way, and that is the point of naming the
 * difference rather than building a second sequence: a credential is collected
 * by connecting, and connecting means a host key decided first. What changes is
 * only the ending. `open` attaches the session to a terminal; `inline` closes
 * the connection it just made, because a saved password is the whole of what
 * was wanted and an authenticated connection nobody can see is #168.
 *
 * `inline` used to be `'credential'`'s sibling, one opening the separate
 * credential window and the other collecting the secret on the wizard's own
 * step, ADR-0032. ADR-0034 retired `'credential'` along with the single-page
 * form it belonged to: the wizard is the only path that ever collects a
 * credential without opening a terminal, so there is only one name for it
 * now. ADR-0039 later retired the window itself: `'open'` no longer falls
 * back to one when nothing usable is saved, it sends the user to that
 * host's own wizard entry instead.
 */
export type ConnectIntent = 'open' | 'inline';

/** Where a connection attempt is. */
export type ConnectStage =
  | { readonly stage: 'idle' }
  /**
   * Reaching the host, and, once that answers, trying whatever credential
   * is already saved or kept before anything asks for a fresh one. ADR-0039
   * folded what used to be a separate `'authenticating'` stage into this
   * one: there is no window to distinguish it from any more, and the whole
   * span from opening the socket to a saved credential either working or
   * not is one continuous wait as far as the screen is concerned.
   */
  | { readonly stage: 'connecting' }
  /** Waiting on the user to decide about a host key. */
  | { readonly stage: 'deciding'; readonly decision: HeldDecision }
  /**
   * The host key is settled and the connection is open, unauthenticated,
   * waiting on the wizard's own inline form rather than a window. Only ever
   * reached by the `'inline'` intent, ADR-0032.
   */
  | { readonly stage: 'awaitingInline'; readonly handle: SessionHandle }
  /**
   * A bastion needs a credential nobody has saved, mid-chain, before the
   * target is even reached. ADR-0033: also only the `'inline'` intent's own
   * doing. `request` is the opaque request `submitCredential` answers, and
   * `prompt` is what came back for it, `carrying` included, so the wizard's
   * form can say which host this credential actually belongs to.
   */
  | {
      readonly stage: 'awaitingBastionCredential';
      readonly request: number;
      readonly prompt: CredentialPrompt;
    }
  /**
   * A credential attempt that reached the end. The connection is closed.
   *
   * `keeping` is what the core answered, and it is not the whole story: it
   * says a secret was kept and not where. Whether it reached the keychain is
   * read from the session afterwards, because that is the fact that outlives
   * the run.
   */
  | { readonly stage: 'settled'; readonly keeping: Keeping }
  | {
      readonly stage: 'failed';
      readonly code: IpcErrorCode;
      /** Which host it failed at, or `null` when there was no chain. */
      readonly hop: Hop | null;
    };

/**
 * A failure, and which host in a chain it happened at.
 */
export interface ReportedFailure {
  readonly code: IpcErrorCode;
  readonly hop: Hop | null;
}

/**
 * The code and hop a failure should be reported under.
 *
 * A chain failure is reported as the failure that actually happened, at the
 * host it happened at. Reporting it under `chainFailed` itself would give both
 * hops the same message and throw away the only thing the wrapper carries.
 *
 * The session state machine then sees the inner code, so a bastion that cannot
 * be reached still marks the session unreachable, which is true: the host
 * cannot be reached, and the reason is one hop further away than usual.
 */
export function reportedFailure(error: IpcError | null): ReportedFailure {
  if (error === null) return { code: 'sshTransport', hop: null };
  if (error.code === 'chainFailed') return { code: error.inner.code, hop: error.hop };

  return { code: error.code, hop: null };
}

/**
 * Whether an attempt is still working, and should say so on screen.
 *
 * `deciding` is deliberately excluded: a held host key is not progress, it is a
 * question, and showing a spinner over it would say the application is busy
 * when it is in fact waiting on the user. `failed` is excluded for the same
 * reason in reverse — it is an answer, not a wait.
 */
export function isInProgress(stage: ConnectStage): boolean {
  return stage.stage === 'connecting';
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
 * Whether a saved credential failing should fall back to asking.
 *
 * A stored secret that the host refuses is a stale password, and the answer is
 * to ask for the current one. A transport failure is not, and asking again
 * would put a prompt in front of someone whose network is down.
 *
 * The internal vault's own failures (ADR-0035) belong here for the same
 * reason the keychain's do: the credential this hop wants is unreachable
 * right now, and typing it fresh works regardless of which store was supposed
 * to hand it back. `vaultWrongPassword` and `vaultUnwritable` are missing on
 * purpose, they answer a master-password prompt in Settings and can never
 * come out of resolving a saved credential.
 */
export function shouldPromptAfterSaved(code: IpcErrorCode): boolean {
  return (
    code === 'noSavedCredential' ||
    code === 'authenticationFailed' ||
    code === 'keychainReadFailed' ||
    code === 'keychainUnavailable' ||
    code === 'vaultLocked' ||
    code === 'vaultNotConfigured' ||
    code === 'vaultUnreadable'
  );
}

/**
 * Which saved host's own wizard entry answers a missing credential.
 *
 * ADR-0039: the target's own case names itself, `sessionId`, the one that
 * was clicked. A bastion crossed mid-chain is a different saved session,
 * found the only way the frontend has to name one: the target's own
 * `proxyJump`. `null` for a target with no jump host at all, which cannot
 * happen for a `'bastion'` hop in practice, `check_proxy_jump` refuses a
 * connection through a jump host that does not resolve to a saved session
 * before this is ever reached, but the type has no way to say that, so the
 * caller is left to decide what a `null` it should never see actually means.
 */
export function credentialRedirectTarget(
  sessionId: string,
  hop: Hop,
  saved: readonly Session[],
): string | null {
  if (hop === 'target') return sessionId;

  return saved.find((session) => session.id === sessionId)?.proxyJump ?? null;
}
