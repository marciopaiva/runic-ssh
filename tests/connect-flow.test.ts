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
  isInProgress,
  isOverridable,
  needsConfirmation,
  shouldPromptAfterSaved,
  shouldTrySaved,
  wasCancelled,
} from '../src/features/sessions/connect';
import { describeKeeping, hasStoredCredential } from '../src/features/sessions/kept';
import type { IpcError, Session } from '../src/ipc';

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
  it('is always tried, because only the core knows whether there is one', () => {
    /* It used to be decided from `credentialId` in the session file, which
       answers a different question: whether something was once written to the
       keychain. That says nothing about a credential kept for this run
       (ADR-0025), and it can be stale when an entry was removed outside the
       application. Asking and falling through is the honest shape, and
       prompting for a password the machine already holds is why people stop
       keeping them. */
    expect(shouldTrySaved('open')).toBe(true);
  });

  it('is not tried when the point of the attempt is to collect one', () => {
    /* Somebody who asked to save a password is asking to type it. A host that
       already has a working one would authenticate silently, the window would
       never open, and the button would have done nothing anybody could see on
       a host where something was in fact stored. */
    expect(shouldTrySaved('credential')).toBe(false);
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

describe('what counts as still working', () => {
  /* The connecting surface keys off this. Before it there was no surface at
     all: the panel stayed empty and the status bar carried one word, for the
     two minutes the TCP stack takes to give up on a host that does not answer
     — and forever if the transport connects and the handshake stalls, because
     `client::Config::default()` sets no timeout of any kind. */

  it('is working while it reaches the host', () => {
    expect(isInProgress({ stage: 'connecting' })).toBe(true);
  });

  it('is working while the credential window is open', () => {
    expect(isInProgress({ stage: 'authenticating' })).toBe(true);
  });

  it('is not working while a host key is held', () => {
    /* A spinner over the trust prompt would say the application is busy when
       it is waiting on the user — and the prompt is the surface that must be
       on screen, not covered by one. */
    expect(
      isInProgress({ stage: 'deciding', decision: { pending: 1, verdict: 'unknown' } }),
    ).toBe(false);
  });

  it('is not working once it has failed', () => {
    expect(isInProgress({ stage: 'failed', code: 'hostUnreachable', hop: null })).toBe(false);
  });

  it('is not working before anything started', () => {
    expect(isInProgress({ stage: 'idle' })).toBe(false);
  });
});

describe('a password collected by connecting once', () => {
  /* Four endings, and three of them mean the host asks again next time. The
     core answers `kept` for both ways of keeping one (ADR-0025), so where it
     went is read from the session rather than from the answer. */
  it('says it is saved only when the session carries a credential', () => {
    expect(describeKeeping('kept', true).title).toBe('kept.stored.title');
  });

  it('says a run-long credential is a run-long credential', () => {
    /* Reporting this as saved would be a promise the next start does not
       keep: nothing was written, deliberately. */
    const outcome = describeKeeping('kept', false);

    expect(outcome.title).toBe('kept.run.title');
    expect(outcome.tone).toBe('neutral');
  });

  it('raises the one nobody chose', () => {
    const outcome = describeKeeping('refused', false);

    expect(outcome.title).toBe('kept.refused.title');
    expect(outcome.tone).toBe('danger');
  });

  it('does not treat "never" as a failure', () => {
    /* They authenticated and asked for nothing to be kept. A danger tone here
       would report a choice as a defect. */
    const outcome = describeKeeping('notAsked', false);

    expect(outcome.title).toBe('kept.none.title');
    expect(outcome.tone).toBe('neutral');
  });
});

describe('reading whether a host has a stored password', () => {
  const session = (overrides: Partial<Session> = {}): Session => ({
    id: 'fixture',
    name: 'fixture',
    host: '127.0.0.1',
    port: 2222,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    ...overrides,
  });

  it('reads a stored one', () => {
    expect(hasStoredCredential(session({ credentialId: 'session:fixture' }))).toBe(true);
  });

  it('treats an absent field the way it treats null', () => {
    /* The core skips the field entirely for a host with nothing stored, so
       what arrives is `undefined` and never `null`. A strict comparison
       against `null` is true for every host in the tree, and it told somebody
       their password was in the system keychain when they had asked for it to
       be kept only until the application closes. `proxyJump` taught the same
       lesson first; see `jump.ts`. */
    const wire = JSON.parse(
      JSON.stringify({ ...session(), credentialId: undefined }),
    ) as Session;

    expect(hasStoredCredential(wire)).toBe(false);
    expect(hasStoredCredential(session())).toBe(false);
  });
});
