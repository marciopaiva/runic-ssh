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
import {
  bastionName,
  eligibleJumpHosts,
  jumpHostChoice,
  jumpRole,
  orderChain,
} from '../src/features/sessions/jump';
import { describeFailure } from '../src/features/sessions/failure';
import { createTranslator } from '../src/lib/i18n';
import type { IpcError, Session } from '../src/ipc';

/* Defaults to `jumpServer`: this file is about jump-host eligibility, and
   `eligibleJumpHosts` now requires the kind (ADR-0031) on top of the rules
   that predate it. The kind filter itself gets its own tests below, with an
   override; every other test here is about a rule from before that filter
   existed and should not have to fight it to construct a fixture. */
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
    kind: 'jumpServer',
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

  it('says the same for the internal vault at a bastion hop', () => {
    /* ADR-0035. `worth_asking` in `commands/sessions.rs` excludes all three of
       the internal vault's own failures from the bastion prompt for the same
       reason it excludes `keychainReadFailed`: a store that exists and is
       refusing is not a store with nothing saved. */
    for (const code of ['vaultLocked', 'vaultNotConfigured', 'vaultUnreadable'] as const) {
      expect(describeFailure(code, 'bastion').title).toBe('failure.jumpCredential.title');
      expect(describeFailure(code, 'bastion').retryable).toBe(false);
    }
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
      '[{"id":"a","name":"a","host":"a.example","port":22,"user":"deploy","group":null,"credentialId":null,"kind":"jumpServer"}]',
    ) as Session[];

    expect(eligibleJumpHosts(wire, null).map((host) => host.id)).toEqual(['a']);
  });
});

describe('which kind may be a jump host (ADR-0031)', () => {
  it('offers only hosts tagged jumpServer', () => {
    const saved = [
      session('bastion'),
      session('db', { kind: 'database' }),
      session('web', { kind: 'web' }),
      session('untagged', { kind: 'other' }),
    ];

    expect(eligibleJumpHosts(saved, null).map((host) => host.id)).toEqual(['bastion']);
  });

  it('keeps a chosen bastion offered even if its kind no longer qualifies', () => {
    /* A host saved before ADR-0031 existed, or retagged since, must not have
       its own field make the choice it is already holding disappear. The
       same reasoning `carried` below rests on: a form that stops offering a
       value it still holds needs a way to clear it, not a silent mismatch
       between the select and the string underneath it. */
    const saved = [session('bastion', { kind: 'database' }), session('web-01')];

    const choice = jumpHostChoice(saved, 'web-01', 'bastion');
    expect(choice.offered.map((host) => host.id)).toEqual(['bastion']);
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

  it('says both marks in every language', () => {
    /* Two shapes of one family, so a screen reader gets two sentences rather
       than one and a silence. A direct host draws neither: `JumpMark` returns
       null for it, so there is no third string to check here any more. */
    for (const locale of ['en', 'pt-BR', 'es']) {
      const i18n = createTranslator(locale);

      for (const key of ['sessions.jump.carries', 'sessions.jump.rides'] as const) {
        expect(i18n.t(key), `${locale} ${key}`).not.toBe(key);
      }
    }
  });
});

describe('naming the bastion a host rides', () => {
  /* Riding is always exactly one bastion, so it is always namable, unlike
     carrying (a bastion can carry more than one). This is what a sidebar row
     shows in place of the address when position cannot: a bastion filed
     under its own group, and DEV, HOM and PRD apart from it. */

  it('names it when the bastion is still in the saved list', () => {
    const saved = [session('bastion1'), session('dev-web', { proxyJump: 'bastion1' })];

    expect(bastionName(session('dev-web', { proxyJump: 'bastion1' }), saved)).toBe('bastion1');
  });

  it('says nothing for a host that rides no one', () => {
    expect(bastionName(session('plain', { proxyJump: null }), [])).toBeNull();
  });

  it('says nothing for a reference that no longer resolves', () => {
    /* The bastion it named was deleted, or the id is stale. Silence here is
       what tells `SessionsSidebar` to fall back to `JumpMark`'s icon instead
       of a label with nothing to say. */
    const saved = [session('dev-web', { proxyJump: 'gone' })];

    expect(bastionName(session('dev-web', { proxyJump: 'gone' }), saved)).toBeNull();
  });
});

describe('ordering a chain by position instead of by mark', () => {
  /* The row used to carry the relation as a glyph. This places a rider
     directly under the bastion it rides instead, so the sidebar can draw the
     relation as indentation and skip the mark for exactly the rows where the
     indentation already says it. */

  it('leaves a host with no chain at the top, unindented', () => {
    const saved = [session('plain', { proxyJump: null })];

    expect(orderChain(saved)).toEqual([{ id: 'plain', depth: 0, childrenShown: false }]);
  });

  it('nests a rider directly beneath the bastion it rides', () => {
    const saved = [session('bastion'), session('web-01', { proxyJump: 'bastion' })];

    expect(orderChain(saved)).toEqual([
      { id: 'bastion', depth: 0, childrenShown: true },
      { id: 'web-01', depth: 1, childrenShown: false },
    ]);
  });

  it('keeps a rider unindented when its bastion is not in this list', () => {
    /* The bastion is filed under a different group heading, or was deleted
       out from under a stale reference. Either way there is nothing here to
       nest under, so the sidebar falls back to `JumpMark`'s glyph for this
       row rather than losing the fact silently. */
    const saved = [session('web-01', { proxyJump: 'bastion' })];

    expect(orderChain(saved)).toEqual([{ id: 'web-01', depth: 0, childrenShown: false }]);
  });

  it('places every rider right after its bastion, in the order they were saved', () => {
    const saved = [
      session('bastion'),
      session('web-01', { proxyJump: 'bastion' }),
      session('web-02', { proxyJump: 'bastion' }),
      session('plain', { proxyJump: null }),
    ];

    expect(orderChain(saved).map((row) => row.id)).toEqual([
      'bastion',
      'web-01',
      'web-02',
      'plain',
    ]);
  });

  it('nests a chain two hops deep, however the file lists them', () => {
    /* A state the file can hold and connecting refuses (`jumpRole`'s own
       test above). Ordering does not get to assume the chain is one this
       app would ever let somebody make; it only draws the one on disk. */
    const saved = [
      session('inner', { proxyJump: 'middle' }),
      session('outer'),
      session('middle', { proxyJump: 'outer' }),
    ];

    expect(orderChain(saved)).toEqual([
      { id: 'outer', depth: 0, childrenShown: true },
      { id: 'middle', depth: 1, childrenShown: true },
      { id: 'inner', depth: 2, childrenShown: false },
    ]);
  });

  it('does not nest a host under itself', () => {
    const saved = [session('confused', { proxyJump: 'confused' })];

    expect(orderChain(saved)).toEqual([{ id: 'confused', depth: 0, childrenShown: false }]);
  });

  it('does not loop forever on a cycle written by hand', () => {
    /* Nothing in this app writes one, but the file is something a person can
       edit directly, and a rendering function that hangs on malformed input
       is its own bug report. */
    const saved = [
      session('a', { proxyJump: 'b' }),
      session('b', { proxyJump: 'a' }),
    ];

    const rows = orderChain(saved);
    expect(rows.map((row) => row.id).sort()).toEqual(['a', 'b']);
  });
});

describe('a host other sessions are reached through', () => {
  /* #171: the core refuses giving it a jump host of its own, and the form is
     what makes that refusal something the user meets as an absence with a
     reason rather than as a save that fails. */
  const bastion = session('bastion');
  const gateway = session('gateway');
  const web = session('web-01', { proxyJump: 'bastion' });
  const saved = [bastion, gateway, web];

  it('offers no jump host and names who depends on it', () => {
    const choice = jumpHostChoice(saved, 'bastion', '');

    expect(choice.offered).toEqual([]);
    expect(choice.carried.map((host) => host.id)).toEqual(['web-01']);
  });

  it('offers only the value already stored, so it can be cleared', () => {
    /* The state this check refuses can already be in the file, because the
       check is newer than the sessions. Offering nothing would leave it
       unfixable from the editor; offering the eligible list would be a form
       contradicting the message beside it. */
    const broken = [{ ...bastion, proxyJump: 'gateway' }, gateway, web];
    const choice = jumpHostChoice(broken, 'bastion', 'gateway');

    expect(choice.offered.map((host) => host.id)).toEqual(['gateway']);
    expect(choice.carried.map((host) => host.id)).toEqual(['web-01']);
  });

  it('leaves every other host alone', () => {
    const choice = jumpHostChoice(saved, 'web-01', '');

    expect(choice.carried).toEqual([]);
    expect(choice.offered.map((host) => host.id)).toEqual(
      eligibleJumpHosts(saved, 'web-01').map((host) => host.id),
    );
  });

  it('carries nothing when the session does not exist yet', () => {
    const choice = jumpHostChoice(saved, null, '');

    expect(choice.carried).toEqual([]);
    expect(choice.offered.map((host) => host.id)).toEqual(['bastion', 'gateway']);
  });
});
