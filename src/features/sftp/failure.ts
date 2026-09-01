/**
 * Saying why an SFTP listing or transfer did not happen.
 *
 * ADR-0007: the message is written here, against the code, never built by
 * the core. Mirrors `features/sessions/failure.ts`'s own shape for the same
 * reason that one exists. A code with nothing rendering it is the worst
 * version of an error.
 */

import type { IpcErrorCode } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

const MESSAGES: Partial<Record<IpcErrorCode, ParameterlessKey>> = {
  sftpNotConnected: 'sftp.error.notConnected',
  sftpNotFound: 'sftp.error.notFound',
  sftpPermissionDenied: 'sftp.error.permissionDenied',
  sftpLocalIoFailed: 'sftp.error.localIo',
  sftpProtocolFailed: 'sftp.error.protocol',
  /* Not shown as a transfer error in the transfers list: `browser.ts`'s own
     reducer turns this into a `'cancelled'` status before anything renders
     an error for it. Mapped here anyway so a caller that does show it (a
     listing refused mid-navigation, say) still has a sentence rather than
     the fallback. */
  sftpTransferCancelled: 'sftp.error.cancelled',
  /* `check` names which of `sftp::path::PathError`'s five shapes refused the
     name; none of the five reads as more actionable to a user than the
     others; a name landed here at all, so one sentence covers it. Shared
     with `localNameRefused` (ADR-0048): the same five checks refuse a name
     typed into this application's own UI, for a new directory or a
     rename, whichever endpoint it targets. */
  sftpNameRefused: 'sftp.error.nameRefused',
  localNameRefused: 'sftp.error.nameRefused',
  localDirectoryNotFound: 'sftp.error.localNotFound',
  localNotADirectory: 'sftp.error.localNotADirectory',
  localPermissionDenied: 'sftp.error.localPermissionDenied',
  localIoFailed: 'sftp.error.localIo',
};

/** The last resort: says the client failed and does not pretend to know why. */
const UNEXPECTED: ParameterlessKey = 'failure.unexpected.body';

export function describeSftpFailure(code: IpcErrorCode): ParameterlessKey {
  return MESSAGES[code] ?? UNEXPECTED;
}

/** Every failure this maps, for the test that checks each has its own copy. */
export const MAPPED_SFTP_FAILURES: readonly ParameterlessKey[] = Object.values(MESSAGES);
