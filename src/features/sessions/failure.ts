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

import type { Hop, IpcErrorCode } from '../../ipc';
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
  /* ADR-0035. `vaultLocked` gets its own copy, reused from the Settings
     screen that unlocks it, because that is exactly what is wrong: the
     credential is there and the master password has not been given yet this
     run. `vaultNotConfigured` and `vaultUnreadable` are the rarer cases,
     a race with the vault being disabled mid-session or a corrupted file,
     and share one generic message the same way the keychain's two codes
     do above. */
  vaultLocked: {
    title: 'vault.unlock.title',
    body: 'vault.unlock.body',
    retryable: true,
  },
  vaultNotConfigured: {
    title: 'failure.vault.title',
    body: 'failure.vault.body',
    retryable: true,
  },
  vaultUnreadable: {
    title: 'failure.vault.title',
    body: 'failure.vault.body',
    retryable: true,
  },
  unknownSession: {
    title: 'failure.unknownSession.title',
    body: 'failure.unknownSession.body',
    retryable: false,
  },
  /* One message for all four problems the core distinguishes. Only two of
     them can be met by connecting: a jump host that was deleted, and one that
     has since been put behind a jump host of its own. A session naming itself,
     and a bastion being given a jump host while other sessions are reached
     through it, are both refused when they are saved, so nothing can be stored
     in either state and nothing can reach this by connecting. Both reachable
     cases are fixed the same way, in the editor, which is what the message
     says. */
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

/**
 * A store that is there and refusing, at the hop that cannot ask.
 *
 * This set used to hold three codes. ADR-0027 took two of them away: a jump
 * host with nothing saved, and a machine with no store at all, now open a
 * prompt instead of failing, which is what closed #165. What is left is the
 * case that decision deliberately did not cover, and the copy has to say why
 * this one hop is not offering to let the credential be typed. A locked keyring
 * is a different problem from an empty one, and typing past it would leave the
 * real cause in place.
 *
 * ADR-0035 gave the keyring a second kind of store, and `worth_asking` in
 * `commands/sessions.rs` already excludes all three of its failures from the
 * bastion prompt for that same reason. This is the frontend half of that
 * exclusion: the copy for it, not a new decision.
 */
const STORE_REFUSED: ReadonlySet<IpcErrorCode> = new Set<IpcErrorCode>([
  'keychainReadFailed',
  'vaultLocked',
  'vaultNotConfigured',
  'vaultUnreadable',
]);

export function describeFailure(code: IpcErrorCode, hop: Hop | null = null): Failure {
  if (hop === 'bastion' && STORE_REFUSED.has(code)) {
    return {
      title: 'failure.jumpCredential.title',
      body: 'failure.jumpCredential.body',
      retryable: false,
    };
  }

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
 * because nothing was learned about it. A cancelled credential prompt, a
 * refused RSA key, a keychain that did not answer: none of those are the
 * host's doing, and a crossed-out marker beside a host that is up and fine is
 * a lie the user has to disprove by trying again.
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
