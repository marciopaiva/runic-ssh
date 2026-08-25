/**
 * Saying why a connection did not happen.
 *
 * This existed as a code on a state object that nothing rendered. The result
 * was the worst version of an error: a marker in the sidebar changed shape,
 * the main area stayed empty, and the user was left to guess between a wrong
 * port, a host that is down, and a bug in the client.
 *
 * Every failure below names something the user can act on, or says plainly
 * that it is ours. A message that only restates the error code is a message
 * that was written to fill the space.
 */

import type { IpcErrorCode } from '../../ipc';
import type { ConnectionKind } from './state';
import type { ParameterlessKey } from '../../lib/i18n';

export interface Failure {
  readonly title: ParameterlessKey;
  readonly body: ParameterlessKey;
  /**
   * Whether trying the same thing again could work.
   *
   * A refused password will not fix itself, but the credential is asked for
   * again on the next attempt, so retrying is exactly right. A revoked host
   * key never becomes acceptable, and a retry button there is an invitation
   * to keep pressing it.
   */
  readonly retryable: boolean;
}

const FAILURES: Partial<Record<IpcErrorCode, Failure>> = {
  hostUnreachable: {
    title: 'failure.unreachable.title',
    body: 'failure.unreachable.body',
    retryable: true,
  },
  connectTimedOut: {
    title: 'failure.timeout.title',
    body: 'failure.timeout.body',
    retryable: true,
  },
  sshTransport: {
    title: 'failure.transport.title',
    body: 'failure.transport.body',
    retryable: true,
  },
  authenticationFailed: {
    title: 'failure.authentication.title',
    body: 'failure.authentication.body',
    retryable: true,
  },
  credentialDismissed: {
    title: 'failure.cancelled.title',
    body: 'failure.cancelled.body',
    retryable: true,
  },
  keyUnreadable: {
    title: 'failure.keyUnreadable.title',
    body: 'failure.keyUnreadable.body',
    retryable: true,
  },
  rsaKeyRefused: {
    title: 'failure.rsaRefused.title',
    body: 'failure.rsaRefused.body',
    retryable: false,
  },
  hostKeyRevoked: {
    title: 'hostKey.revoked.title',
    body: 'failure.revoked.body',
    retryable: false,
  },
  hostKeyCertificateRequired: {
    title: 'hostKey.certificate.title',
    body: 'failure.certificate.body',
    retryable: false,
  },
  promptUnavailable: {
    title: 'failure.prompt.title',
    body: 'failure.prompt.body',
    retryable: true,
  },
  keychainUnavailable: {
    title: 'failure.keychain.title',
    body: 'failure.keychain.body',
    retryable: true,
  },
  keychainReadFailed: {
    title: 'failure.keychain.title',
    body: 'failure.keychain.body',
    retryable: true,
  },
  unknownSession: {
    title: 'failure.unknownSession.title',
    body: 'failure.unknownSession.body',
    retryable: false,
  },
  /* One message for all three problems the core distinguishes. Only two of
     them can be met by connecting: a jump host that was deleted, and one that
     has since been put behind a jump host of its own. A session naming itself
     is refused when it is saved, so nothing can be stored in that state and
     nothing can reach this by connecting. Both reachable cases are fixed the
     same way, in the editor, which is what the message says. */
  invalidProxyJump: {
    title: 'failure.proxyJump.title',
    body: 'failure.proxyJump.body',
    retryable: false,
  },
};

/**
 * The last resort.
 *
 * Says the client failed and does not pretend to know why, because inventing
 * a cause is worse than admitting there is none to give. The code is shown
 * beside it so a bug report can name the failure exactly.
 */
const UNEXPECTED: Failure = {
  title: 'failure.unexpected.title',
  body: 'failure.unexpected.body',
  retryable: true,
};

export function describeFailure(code: IpcErrorCode): Failure {
  return FAILURES[code] ?? UNEXPECTED;
}

/** Every failure this maps, for the test that checks each has its own copy. */
export const MAPPED_FAILURES: readonly Failure[] = Object.values(FAILURES).filter(
  (failure): failure is Failure => failure !== undefined,
);

/**
 * What the sidebar marker becomes after an attempt fails.
 *
 * Only a failure that says something about *reaching the host* is allowed to
 * mark it unreachable. Everything else leaves the host as a plain stored one,
 * because nothing was learned about it: a closed credential window, a refused
 * RSA key, a keychain that did not answer — none of those are the host's
 * doing, and a crossed-out marker beside a host that is up and fine is a lie
 * the user has to disprove by trying again.
 *
 * Found by cancelling the credential prompt and reading the status bar: it
 * said "Cancelled" in the panel and "Unreachable" on the floor, about the same
 * session, at the same moment.
 */
export function stateAfterFailure(code: IpcErrorCode): ConnectionKind {
  if (code === 'hostKeyDecision') return 'keyMismatch';
  if (code === 'hostUnreachable' || code === 'sshTransport' || code === 'connectTimedOut') {
    return 'unreachable';
  }

  return 'saved';
}
