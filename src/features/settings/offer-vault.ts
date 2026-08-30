/**
 * Whether Home's internal vault card (ADR-0035) has anything to offer.
 *
 * The system keychain stays the default path; the internal vault exists for
 * the machine that has none. Offering the card anyway, when the keychain
 * already works, would trade something that protects a credential
 * invisibly for a master password somebody now has to remember, for
 * nothing gained. The one exception is a vault that is already configured:
 * hiding the card then would leave nobody a way to manage, disable or
 * reset it, worse than showing it on a machine that no longer strictly
 * needs it.
 */

/* From the modules themselves, never from `src/ipc/index.ts`: this file is
   reachable from `features/settings`'s own barrel, which `CredentialWindow`
   already imports for `useTranslator`, and that barrel re-exports the
   terminal wrappers ADR-0008 keeps out of that document's reach.
   `tests/credential-window.test.ts` caught exactly this the first time. */
import type { CredentialStoreStatus } from '../../ipc/sessions';
import type { InternalVaultState } from '../../ipc/vault';

export function offerInternalVault(
  vaultStatus: InternalVaultState,
  keychainStatus: CredentialStoreStatus,
): boolean {
  return vaultStatus !== 'notConfigured' || keychainStatus.kind !== 'available';
}
