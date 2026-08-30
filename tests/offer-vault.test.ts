/**
 * ADR-0035: the internal vault is a fallback for a machine with no working
 * system keychain, not a general upgrade. These pin the one rule that
 * decides whether Home offers it at all.
 */

import { describe, expect, it } from 'vitest';

import { offerInternalVault } from '../src/features/settings/offer-vault';
import type { CredentialStoreStatus } from '../src/ipc';

const AVAILABLE: CredentialStoreStatus = { kind: 'available' };
const UNAVAILABLE: CredentialStoreStatus = { kind: 'unavailable', reason: 'no secret service' };

describe('whether the internal vault card has anything to offer', () => {
  it('hides when the system keychain works and nothing is configured', () => {
    expect(offerInternalVault('notConfigured', AVAILABLE)).toBe(false);
  });

  it('shows when the system keychain has no answer', () => {
    expect(offerInternalVault('notConfigured', UNAVAILABLE)).toBe(true);
  });

  it('keeps showing a locked vault even once the keychain works again', () => {
    /* The machine that made this necessary may not be the machine running
       it forever. Hiding the card would strand it: no way to unlock,
       disable or reset. */
    expect(offerInternalVault('locked', AVAILABLE)).toBe(true);
  });

  it('keeps showing an unlocked vault even once the keychain works again', () => {
    expect(offerInternalVault('unlocked', AVAILABLE)).toBe(true);
  });
});
