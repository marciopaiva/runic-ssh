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
import { eligibleJumpHosts, jumpRole } from '../src/features/sessions/jump';
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

  it('says why this one hop will not let the credential be typed', () => {
    /* A keychain that is there and refusing. ADR-0027 deliberately did not
       cover this case: prompting past a locked keyring would teach people to
       retype a password rather than unlock it, and would leave the real cause
       in place. So the copy has to explain why this hop is different, which is
       the one thing ADR-0027 named as invisible otherwise. */
    expect(describeFailure('keychainReadFailed', 'bastion').title).toBe(
      'failure.jumpCredential.title',
    );
    expect(describeFailure('keychainReadFailed', 'bastion').retryable).toBe(false);
  });

  it('no longer claims a jump host has nowhere to type a credential', () => {
    /* These two took that path until ADR-0027. They now open a prompt in the
       core instead of failing, which is what closed #165, so reaching this
       function with either of them at the bastion hop should not happen. If it
       ever does, the ordinary keychain copy is the true one: it offers a window
       and a window is now what there is. */
    for (const code of ['keychainUnavailable', 'noSavedCredential'] as const) {
      expect(describeFailure(code, 'bastion').title).not.toBe('failure.jumpCredential.title');
    }
  });

  it('keeps the ordinary keychain message for the host the user asked for', () => {
    /* There a window does open, so offering it is true. */
    expect(describeFailure('keychainUnavailable', 'target').title).toBe('failure.keychain.title');
    expect(describeFailure('keychainUnavailable').title).toBe('failure.keychain.title');
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
        'failure.jumpCredential.title',
        'failure.jumpCredential.body',
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

  it('reads a session that arrived without the field at all', () => {
    /* What the core actually sends. `skip_serializing_if` omits the field for
       a host that is not behind one, so it arrives `undefined` and never
       `null`. Comparing strictly against `null` matched nothing, so nothing
       was eligible and the select never appeared on the form, with every test
       above still green: they all wrote the field out as `null`, which is a
       shape the core does not produce. Found by opening the form. */
    const wire = JSON.parse(
      '[{"id":"a","name":"a","host":"a.example","port":22,"user":"deploy","group":null,"credentialId":null}]',
    ) as Session[];

    expect(eligibleJumpHosts(wire, null).map((host) => host.id)).toEqual(['a']);
  });
});

describe('saying which hosts are in a chain', () => {
  const saved = [
    session('bastion'),
    session('web-01', { proxyJump: 'bastion' }),
    session('web-02', { proxyJump: 'bastion' }),
    session('plain'),
  ];

  it('marks the host others are reached through', () => {
    /* A relation, so it is decided by the whole list rather than by the row.
       Nothing on the bastion's own record says it is one. */
    expect(jumpRole(session('bastion'), saved)).toEqual({ carries: true, rides: false });
  });

  it('marks a host that is reached through another', () => {
    expect(jumpRole(session('web-01', { proxyJump: 'bastion' }), saved)).toEqual({
      carries: false,
      rides: true,
    });
  });

  it('marks nothing on a host that is in no chain', () => {
    expect(jumpRole(session('plain'), saved)).toEqual({ carries: false, rides: false });
  });

  it('reads a host that arrived without the field at all', () => {
    /* What the core sends for a host that is not behind one: the field is
       skipped, so it is `undefined` and never `null`. The same shape that made
       the select disappear from the form. */
    const wire = JSON.parse(
      '{"id":"a","name":"a","host":"a.example","port":22,"user":"deploy","group":null,"credentialId":null}',
    ) as Session;

    expect(jumpRole(wire, [wire]).rides).toBe(false);
  });

  it('marks both ends when a bastion has been given one of its own', () => {
    /* A state the file can hold and connecting refuses. The core stops a jump
       host that is already behind one from being chosen, but nothing stops a
       host already serving as a bastion from being given one afterwards. The
       chain is then a hop too long and fails only when somebody connects, so
       showing both marks is how it becomes visible before then. */
    const broken = [
      session('outer'),
      session('middle', { proxyJump: 'outer' }),
      session('inner', { proxyJump: 'middle' }),
    ];

    expect(jumpRole(session('middle', { proxyJump: 'outer' }), broken)).toEqual({
      carries: true,
      rides: true,
    });
  });

  it('says all three marks in every language', () => {
    /* Three shapes of one family, so a screen reader gets three sentences
       rather than one and two silences. */
    for (const locale of ['en', 'pt-BR', 'es']) {
      const i18n = createTranslator(locale);

      for (const key of [
        'sessions.jump.carries',
        'sessions.jump.rides',
        'sessions.jump.direct',
      ] as const) {
        expect(i18n.t(key), `${locale} ${key}`).not.toBe(key);
      }
    }
  });
});
