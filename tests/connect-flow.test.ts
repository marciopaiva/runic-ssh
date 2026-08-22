/**
 * Guards the order a connection happens in.
 *
 * One rule matters more than the rest and this file exists for it: **a host
 * key decision always precedes a credential**. A password typed at a host
 * nobody verified is a password given to whoever answered, so a client that
 * prompts first and verifies afterwards has not implemented rule 3 — it has
 * implemented a slower version of not having it.
 */

import { describe, expect, it } from 'vitest';

import {
  heldDecision,
  isOverridable,
  needsConfirmation,
  shouldPromptAfterSaved,
  shouldTrySaved,
  wasCancelled,
} from '../src/features/sessions/connect';
import type { IpcError } from '../src/ipc';

const rejected = (verdict: 'unknown' | 'changed' | 'revoked' | 'certificateRequired'): IpcError => ({
  code: 'hostKeyDecision',
  pending: 7,
  inner: { code: 'hostKeyRejected', verdict, offered: 'SHA256:new', stored: ['SHA256:old'] },
});

describe('reading a host key refusal', () => {
  it('recognises one the core is holding', () => {
    expect(heldDecision(rejected('unknown'))).toEqual({ pending: 7, verdict: 'unknown' });
  });

  it('does not mistake another failure for one', () => {
    /* A connection that failed for another reason must not put a trust prompt
       on screen: the user would be accepting a key nobody offered. */
    expect(heldDecision({ code: 'hostUnreachable' })).toBeNull();
    expect(heldDecision({ code: 'authenticationFailed' })).toBeNull();
  });

  it('refuses a decision whose inner failure is not a refusal', () => {
    expect(
      heldDecision({ code: 'hostKeyDecision', pending: 7, inner: { code: 'sshTransport' } }),
    ).toBeNull();
  });
});

describe('what a verdict allows', () => {
  it('lets an unknown key be accepted', () => {
    expect(isOverridable('unknown')).toBe(true);
  });

  it('lets a changed key be accepted deliberately', () => {
    expect(isOverridable('changed')).toBe(true);
    expect(needsConfirmation('changed')).toBe(true);
  });

  it('does not ask for a confirmation on a first connection', () => {
    /* Asking for it every time trains the reflex the confirmation exists to
       break. */
    expect(needsConfirmation('unknown')).toBe(false);
  });

  it('offers no override at all for a revoked key', () => {
    /* An override would defeat the only purpose the marker has. */
    expect(isOverridable('revoked')).toBe(false);
  });

  it('offers no override when the host should present a certificate', () => {
    /* Trusting a bare key here is exactly the substitution the marker warns
       about. */
    expect(isOverridable('certificateRequired')).toBe(false);
  });
});

describe('a saved credential', () => {
  it('is tried when the session has one', () => {
    /* Prompting for a password the machine already holds is why people stop
       saving them. */
    expect(shouldTrySaved('runic-ssh:web-01')).toBe(true);
  });

  it('is not tried when the session has none', () => {
    expect(shouldTrySaved(null)).toBe(false);
  });

  it('falls back to asking when the host refuses it', () => {
    /* A stored secret the host rejects is a stale password, and the answer is
       to ask for the current one. */
    expect(shouldPromptAfterSaved('authenticationFailed')).toBe(true);
    expect(shouldPromptAfterSaved('noSavedCredential')).toBe(true);
  });

  it('falls back to asking when the keychain cannot be read', () => {
    expect(shouldPromptAfterSaved('keychainUnavailable')).toBe(true);
    expect(shouldPromptAfterSaved('keychainReadFailed')).toBe(true);
  });

  it('does not ask again when the network is what failed', () => {
    /* A prompt in front of someone whose connection dropped is a password
       typed for nothing. */
    expect(shouldPromptAfterSaved('sshTransport')).toBe(false);
    expect(shouldPromptAfterSaved('hostUnreachable')).toBe(false);
  });

  it('does not ask again when the key itself is refused', () => {
    expect(shouldPromptAfterSaved('rsaKeyRefused')).toBe(false);
  });
});

describe('a dismissed prompt', () => {
  it('is a cancellation, not a failure', () => {
    /* Putting a red message in front of someone who pressed Cancel is how
       people learn to ignore red messages. */
    expect(wasCancelled('credentialDismissed')).toBe(true);
  });

  it('is not confused with the host refusing the credential', () => {
    expect(wasCancelled('authenticationFailed')).toBe(false);
  });
});
