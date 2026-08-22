/**
 * The error shape the core sends.
 *
 * A discriminated union of codes with the fields each one declares — never a
 * sentence. The message the user reads is rendered here, from the catalogue,
 * against the code. See ADR-0007 and `src-tauri/src/error.rs`.
 */

export type IpcError =
  | { readonly code: 'configDirUnavailable' }
  | { readonly code: 'settingsUnreadable'; readonly path: string }
  | { readonly code: 'settingsMalformed'; readonly path: string }
  | { readonly code: 'settingsUnwritable'; readonly path: string }
  | { readonly code: 'invalidLocale'; readonly requested: string }
  | { readonly code: 'hostUnreachable' }
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
  | { readonly code: 'missingCredential' };

export type IpcErrorCode = IpcError['code'];

const CODES: ReadonlySet<string> = new Set<IpcErrorCode>([
  'configDirUnavailable',
  'settingsUnreadable',
  'settingsMalformed',
  'settingsUnwritable',
  'invalidLocale',
  'hostUnreachable',
  'hostKeyRejected',
  'keyUnreadable',
  'rsaKeyRefused',
  'authenticationFailed',
  'sshTransport',
  'unknownSession',
  'unknownHandle',
  'ambiguousCredential',
  'missingCredential',
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
  if (typeof code !== 'string' || !CODES.has(code)) return undefined;

  return rejection as IpcError;
}
