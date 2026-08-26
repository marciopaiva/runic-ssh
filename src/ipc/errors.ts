/**
 * The error shape the core sends.
 *
 * A discriminated union of codes with the fields each one declares — never a
 * sentence. The message the user reads is rendered here, from the catalogue,
 * against the code. See ADR-0007 and `src-tauri/src/error.rs`.
 */

/**
 * Which host in a chain something happened at.
 *
 * A direct connection is always `'target'`, so nothing has to special-case the
 * ordinary case. See ADR-0023.
 */
export type Hop = 'target' | 'bastion';

export type IpcError =
  | { readonly code: 'configDirUnavailable' }
  | { readonly code: 'settingsUnreadable'; readonly path: string }
  | { readonly code: 'settingsMalformed'; readonly path: string }
  | { readonly code: 'settingsUnwritable'; readonly path: string }
  | { readonly code: 'invalidLocale'; readonly requested: string }
  | { readonly code: 'hostUnreachable' }
  | { readonly code: 'connectTimedOut' }
  /**
   * The host key is not trusted. `verdict` names which of the five outcomes it
   * was, so the interface can prompt, block or explain; the fingerprints travel
   * with it because the user has to compare them by eye.
   */
  | {
      readonly code: 'hostKeyRejected';
      readonly verdict: 'unknown' | 'changed' | 'revoked' | 'certificateRequired';
      readonly offered: string | null;
      readonly stored: readonly string[];
    }
  | { readonly code: 'keyUnreadable' }
  /** RSA private keys are refused while RUSTSEC-2023-0071 stands. See ADR-0010. */
  | { readonly code: 'rsaKeyRefused' }
  | { readonly code: 'authenticationFailed' }
  | { readonly code: 'sshTransport' }
  | { readonly code: 'unknownSession'; readonly id: string }
  | { readonly code: 'unknownHandle' }
  | { readonly code: 'ambiguousCredential' }
  | { readonly code: 'missingCredential' }
  | { readonly code: 'malformedInput' }
  /** The core refuses to forward input this large. */
  | { readonly code: 'inputTooLarge' }
  /**
   * A second shell was asked for on a connection that already has one.
   *
   * Unreachable while one terminal stays mounted per session (ADR-0014), and
   * deliberately without copy of its own: it reports a defect on our side, not
   * something the user can act on.
   */
  | { readonly code: 'terminalAlreadyOpen' }
  /** A saved session was rejected; `field` names which part. */
  | { readonly code: 'invalidSession'; readonly field: string }
  /**
   * The jump host a session names cannot be used.
   *
   * Four problems rather than one message, because they ask different things
   * of the reader: pick another host, restore the one that is gone, or shorten
   * a chain that is longer than one hop. `chained` and `serving` are that last
   * one from its two ends: the host being saved is behind a bastion that is
   * itself behind one, or the host being saved is the bastion and other
   * sessions are already reached through it.
   */
  | {
      readonly code: 'invalidProxyJump';
      readonly problem: 'itself' | 'unknown' | 'chained' | 'serving';
    }
  /**
   * A connection failed at one hop of a chain.
   *
   * `hop` says which host, because "the host could not be reached" is the same
   * sentence whichever one it was, and which one is the part the reader cannot
   * work out alone.
   *
   * Never wraps a `hostKeyDecision`: the interface finds a held decision by the
   * code at the top of the error, and a wrapper there would leave a host behind
   * a bastion unable to have its key accepted at all. See
   * `commands::sessions::refusal`.
   */
  | {
      readonly code: 'chainFailed';
      readonly hop: Hop;
      readonly inner: IpcError;
    }
  /**
   * A host key needs a decision.
   *
   * `pending` names the refusal the core is holding; answering means sending
   * that id back, never a host and a key. The interface can only answer a
   * decision it was shown — it cannot describe one it would like made.
   */
  | {
      readonly code: 'hostKeyDecision';
      readonly pending: number;
      readonly inner: IpcError;
    }
  | { readonly code: 'unknownDecision' }
  | { readonly code: 'notAwaitingDecision' }
  /** The file marks this key revoked. Not overridable, deliberately. */
  | { readonly code: 'hostKeyRevoked' }
  /** The host authenticates with a certificate; a bare key will not do. */
  | { readonly code: 'hostKeyCertificateRequired' }
  | { readonly code: 'confirmationMismatch' }
  /**
   * This machine has no credential store.
   *
   * `reason` is a phrase the core wrote, never the platform's own text — see
   * `vault::describe`. The interface degrades to prompting per connection and
   * says why; ADR-0004 required a real answer here rather than a silent
   * failure.
   */
  | { readonly code: 'keychainUnavailable'; readonly reason: string }
  | { readonly code: 'keychainReadFailed'; readonly reason: string }
  | { readonly code: 'keychainWriteFailed'; readonly reason: string }
  /** Distinct from an unavailable store: ask the user rather than explain. */
  | { readonly code: 'noSavedCredential' }
  /** The request id does not name a prompt that is still open. */
  | { readonly code: 'unknownRequest' }
  /**
   * The user closed or cancelled the credential prompt.
   *
   * The connection attempt fails and is never retried on its own — ADR-0008.
   * The interface reports it as a cancellation, not as a failure.
   */
  | { readonly code: 'credentialDismissed' }
  /** The prompt window could not be opened, so nobody could have answered. */
  | { readonly code: 'promptUnavailable' }
  /**
   * A window control we drew could not do what it was asked.
   *
   * Reported rather than dropped: a control that fails silently is
   * indistinguishable from one that was never wired up.
   */
  | { readonly code: 'windowActionRefused' };

export type IpcErrorCode = IpcError['code'];

/**
 * Every code the core can send.
 *
 * Exported so the interface can prove it has something to say about each one:
 * a failure nobody renders is the same as no error handling at all.
 */
export const CODES: ReadonlySet<IpcErrorCode> = new Set<IpcErrorCode>([
  'configDirUnavailable',
  'settingsUnreadable',
  'settingsMalformed',
  'settingsUnwritable',
  'invalidLocale',
  'hostUnreachable',
  'connectTimedOut',
  'hostKeyRejected',
  'keyUnreadable',
  'rsaKeyRefused',
  'authenticationFailed',
  'sshTransport',
  'unknownSession',
  'unknownHandle',
  'ambiguousCredential',
  'missingCredential',
  'malformedInput',
  'inputTooLarge',
  'terminalAlreadyOpen',
  'invalidSession',
  'invalidProxyJump',
  'chainFailed',
  'hostKeyDecision',
  'unknownDecision',
  'notAwaitingDecision',
  'hostKeyRevoked',
  'hostKeyCertificateRequired',
  'confirmationMismatch',
  'keychainUnavailable',
  'keychainReadFailed',
  'keychainWriteFailed',
  'noSavedCredential',
  'unknownRequest',
  'credentialDismissed',
  'promptUnavailable',
  'windowActionRefused',
]);

/**
 * Narrows whatever `invoke` rejected with.
 *
 * A rejection is not guaranteed to be one of ours — the bridge itself can fail
 * — so anything unrecognised stays `undefined` rather than being cast into a
 * shape it does not have.
 */
export function asIpcError(rejection: unknown): IpcError | undefined {
  if (typeof rejection !== 'object' || rejection === null) return undefined;

  const code: unknown = (rejection as { code?: unknown }).code;
  if (typeof code !== 'string' || !CODES.has(code as IpcErrorCode)) return undefined;

  return rejection as IpcError;
}
