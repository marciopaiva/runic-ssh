/**
 * Reaching a host through another one. ADR-0023.
 *
 * Two things are worth pinning here, and neither is about layout. A chain
 * failure has to be reported as the failure that actually happened, at the
 * host it happened at, or both hops read as the same sentence. And the form
 * has to offer only what the core will accept, because the three ways a jump
 * host reference can be wrong are all avoidable by not offering them.
 */

import { describe, expect, it } from 'vitest';

import { reportedFailure } from '../src/features/sessions/connect';
import { eligibleJumpHosts } from '../src/features/sessions/jump';
import { describeFailure } from '../src/features/sessions/failure';
import { createTranslator } from '../src/lib/i18n';
import type { IpcError, Session } from '../src/ipc';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    ...overrides,
  };
}

describe('reporting a failure that happened in a chain', () => {
  it('reports the failure that happened, not the wrapper', () => {
    const error: IpcError = {
      code: 'chainFailed',
      hop: 'bastion',
      inner: { code: 'hostUnreachable' },
    };

    expect(reportedFailure(error)).toEqual({ code: 'hostUnreachable', hop: 'bastion' });
  });

  it('says which hop, because the sentence is the same for both', () => {
    const atTarget: IpcError = {
      code: 'chainFailed',
      hop: 'target',
      inner: { code: 'connectTimedOut' },
    };

    expect(reportedFailure(atTarget).hop).toBe('target');
  });

  it('leaves an ordinary failure exactly as it was', () => {
    /* Every session that is not behind a bastion comes through here. A hop
       appearing on those would put a sentence about jump hosts under failures
       that had nothing to do with one. */
    expect(reportedFailure({ code: 'authenticationFailed' })).toEqual({
      code: 'authenticationFailed',
      hop: null,
    });
  });

  it('falls back rather than throwing when there is no error to read', () => {
    expect(reportedFailure(null)).toEqual({ code: 'sshTransport', hop: null });
  });

  it('has copy of its own for a jump host that cannot be used', () => {
    /* It used to fall through to "the connection failed", which is true and
       useless: the thing to fix is in the editor, and nothing said so. */
    const failure = describeFailure('invalidProxyJump');

    expect(failure.title).toBe('failure.proxyJump.title');
    expect(failure.retryable).toBe(false);
  });

  it('says all of it in every language', () => {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const i18n = createTranslator(locale);

      for (const key of [
        'failure.proxyJump.title',
        'failure.proxyJump.body',
        'failure.hop.bastion',
        'failure.hop.target',
        'hostKey.hop.bastion',
        'session.editor.jumpHost',
        'session.editor.jumpHost.none',
        'session.editor.jumpHostHint',
      ] as const) {
        expect(i18n.t(key), `${locale} ${key}`).not.toBe(key);
      }
    }
  });
});

describe('which hosts may be a jump host', () => {
  it('never offers the session being edited', () => {
    /* The core refuses a session that names itself. Offering it would turn a
       refusal into something somebody has to be told about after a save. */
    const saved = [session('a'), session('b')];

    expect(eligibleJumpHosts(saved, 'a').map((host) => host.id)).toEqual(['b']);
  });

  it('never offers a host that is itself behind one', () => {
    /* One hop, per ADR-0023. A chain longer than that is refused rather than
       connected to the first host and reported as if it had worked. */
    const saved = [session('bastion'), session('middle', { proxyJump: 'bastion' })];

    expect(eligibleJumpHosts(saved, 'far').map((host) => host.id)).toEqual(['bastion']);
  });

  it('offers everything else when creating a session', () => {
    const saved = [session('a'), session('b')];

    expect(eligibleJumpHosts(saved, null)).toHaveLength(2);
  });

  it('offers nothing when nothing is saved, so the control can be absent', () => {
    expect(eligibleJumpHosts([], null)).toEqual([]);
  });
});
