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
  credentialRedirectTarget,
  heldDecision,
  isInProgress,
  isOverridable,
  needsConfirmation,
  resumeTargetAfterEditor,
  shouldPromptAfterSaved,
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

  it('falls back to asking when the internal vault cannot supply it', () => {
    /* ADR-0035. Typing the credential fresh works regardless of which store
       was supposed to hand it back. */
    expect(shouldPromptAfterSaved('vaultLocked')).toBe(true);
    expect(shouldPromptAfterSaved('vaultNotConfigured')).toBe(true);
    expect(shouldPromptAfterSaved('vaultUnreadable')).toBe(true);
  });

  it('does not ask again for the vault failures a resolve can never produce', () => {
    /* `vaultWrongPassword` and `vaultUnwritable` only answer a master-password
       prompt in Settings, never a saved-credential resolve. */
    expect(shouldPromptAfterSaved('vaultWrongPassword')).toBe(false);
    expect(shouldPromptAfterSaved('vaultUnwritable')).toBe(false);
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

describe('which wizard entry answers a missing credential', () => {
  /* ADR-0039: there is nowhere left in Sessions to collect one, so the
     redirect has to name a saved session's own editor. */
  const session = (overrides: Partial<Session> = {}): Session => ({
    id: 'web-01',
    name: 'web-01',
    host: 'web-01.example.com',
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    ...overrides,
  });

  it('names the session itself when the target is missing one', () => {
    const saved = [session()];
    expect(credentialRedirectTarget('web-01', 'target', saved)).toBe('web-01');
  });

  it('names the bastion a target session is carried on', () => {
    const saved = [session({ id: 'web-01', proxyJump: 'jump' }), session({ id: 'jump' })];
    expect(credentialRedirectTarget('web-01', 'bastion', saved)).toBe('jump');
  });

  it('finds no bastion for a session with none', () => {
    const saved = [session()];
    expect(credentialRedirectTarget('web-01', 'bastion', saved)).toBeNull();
  });

  it('treats an absent proxyJump field the same as an empty one', () => {
    /* The core skips the field entirely for a direct host, so what arrives
       is `undefined`, never `null`, the same shape `hasStoredCredential`
       already normalises. */
    const wire = JSON.parse(
      '{"id":"web-01","name":"web-01","host":"web-01.example.com","port":22,"user":"deploy","group":null,"credentialId":null,"kind":"direct"}',
    ) as Session;

    expect(credentialRedirectTarget('web-01', 'bastion', [wire])).toBeNull();
  });
});

describe('retrying after a redirected editor settles (ADR-0040)', () => {
  it('retries the session Sessions was trying to reach', () => {
    expect(resumeTargetAfterEditor('web-01', 'saved')).toBe('web-01');
  });

  it('does not retry a credential that was never actually saved', () => {
    expect(resumeTargetAfterEditor('web-01', 'failed')).toBeNull();
    expect(resumeTargetAfterEditor('web-01', undefined)).toBeNull();
  });

  it('does not retry an editor nobody redirected here', () => {
    /* Opened by hand rather than by `onCredentialMissing`: there is no
       original attempt to hand the answer back to. */
    expect(resumeTargetAfterEditor(undefined, 'saved')).toBeNull();
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

  it('is working while it reaches the host and while a saved credential is tried', () => {
    /* ADR-0039 folded what used to be a separate `'authenticating'` stage
       into this one: there is no window left to distinguish the two. */
    expect(isInProgress({ stage: 'connecting' })).toBe(true);
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
    expect(describeKeeping('kept', true, false).title).toBe('kept.stored.title');
  });

  it('says a run-long credential is a run-long credential', () => {
    /* Reporting this as saved would be a promise the next start does not
       keep: nothing was written, deliberately. */
    const outcome = describeKeeping('kept', false, false);

    expect(outcome.title).toBe('kept.run.title');
    expect(outcome.tone).toBe('neutral');
  });

  it('raises the one nobody chose', () => {
    const outcome = describeKeeping('refused', false, false);

    expect(outcome.title).toBe('kept.refused.title');
    expect(outcome.tone).toBe('danger');
  });

  it('does not treat "never" as a failure', () => {
    /* They authenticated and asked for nothing to be kept. A danger tone here
       would report a choice as a defect. */
    const outcome = describeKeeping('notAsked', false, false);

    expect(outcome.title).toBe('kept.none.title');
    expect(outcome.tone).toBe('neutral');
  });

  it('names the internal vault instead, when that is the backend', () => {
    /* ADR-0035: the same four endings, for the installation that opted into
       the internal vault. `stored`/`refused` are the only two whose body
       names a store at all. */
    expect(describeKeeping('kept', true, true).body).toBe('kept.stored.body.vault');
    expect(describeKeeping('refused', false, true).body).toBe('kept.refused.body.vault');
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
    kind: 'direct',
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
