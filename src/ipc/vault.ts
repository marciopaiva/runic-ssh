/**
 * Typed wrapper over the internal vault commands. ADR-0035.
 *
 * A second store beside the one `credentialStoreStatus` already answers for:
 * that one asks whether the OS keychain exists, this one asks whether this
 * installation has opted into the internal vault instead, and if so whether
 * this session has unlocked it. Never both at once: `Vault`/`InternalVault`
 * on the Rust side dispatch to exactly one of the two.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Whether the internal vault is set up, and if so, whether this session has
 * unlocked it. A bare string on the wire: none of the three carries a field,
 * so there is nothing for a `kind` tag to disambiguate.
 */
export type InternalVaultState = 'notConfigured' | 'locked' | 'unlocked';

export async function internalVaultStatus(): Promise<InternalVaultState> {
  return invoke<InternalVaultState>('internal_vault_status');
}

/**
 * The master password, on its way to a command. Always a plain string on the
 * wire, never the password-or-private-key `Secret` a host's own credential
 * is: this password is never itself an SSH credential, only what unlocks the
 * store a host's own credential might live in.
 */
export type MasterPassword = string;

/**
 * Turns the internal vault on: creates it under `password`, and migrates
 * every credential currently in the OS keychain into it.
 *
 * Nothing is removed from the OS keychain by this call. See the ADR for
 * why leaving those entries in place is the safer choice.
 */
export async function enableInternalVault(password: MasterPassword): Promise<void> {
  return invoke<void>('enable_internal_vault', { password });
}

/** Unlocks the internal vault for the rest of this session. */
export async function unlockInternalVault(password: MasterPassword): Promise<void> {
  return invoke<void>('unlock_internal_vault', { password });
}

/**
 * Turns the internal vault back off: every credential it holds moves back
 * into the OS keychain under the key this session already unlocked it with,
 * then the internal vault's own file is deleted.
 *
 * No password: unlocking already proved it once, and this asks for it no
 * more than resolving one saved credential does. Rejects with `vaultLocked`
 * if the vault has not been unlocked this session.
 */
export async function disableInternalVault(): Promise<void> {
  return invoke<void>('disable_internal_vault');
}

/**
 * The "I forgot the password" exit: wipes the internal vault outright, no
 * password needed. Every credential that lived only there has to be typed
 * again.
 */
export async function resetInternalVault(): Promise<void> {
  return invoke<void>('reset_internal_vault');
}
