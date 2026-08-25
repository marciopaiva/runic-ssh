/**
 * Guards the host form's idea of unsaved work.
 *
 * As a modal this question did not exist: the form appeared, was answered, and
 * whatever was in it died with it. Inside the settings tab it outlives being
 * looked at, so a wrong answer here either throws away typing or lights a
 * marker that never goes out — and a marker that is always lit is one nobody
 * reads.
 */

import { describe, expect, it } from 'vitest';

import { differs, editorValues, isDirty, targetSession } from '../src/features/sessions/editor';
import { EMPTY_DRAFT } from '../src/features/sessions';
import type { Session } from '../src/ipc';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'a1',
    name: 'web-01',
    host: 'web-01.example',
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    ...overrides,
  };
}

describe('what the form starts with', () => {
  it('shows a saved session as it was stored', () => {
    expect(editorValues(session({ port: 2222, group: 'prod' }))).toEqual({
      name: 'web-01',
      host: 'web-01.example',
      port: '2222',
      user: 'deploy',
      group: 'prod',
      proxyJump: '',
    });
  });

  it('shows a blank form for a session that does not exist yet', () => {
    expect(editorValues(null)).toEqual(EMPTY_DRAFT);
  });

  it('shows no group as an empty field rather than the word null', () => {
    expect(editorValues(session({ group: null })).group).toBe('');
  });
});

describe('unsaved work', () => {
  it('sees nothing to lose in an untouched form', () => {
    const saved = session();

    expect(isDirty(editorValues(saved), saved)).toBe(false);
  });

  it('sees nothing to lose in an untouched new session', () => {
    /* The blank form already has a port in it. Counting that as a change
       would mark every new session dirty before anybody typed. */
    expect(isDirty(EMPTY_DRAFT, null)).toBe(false);
  });

  it('notices a changed field', () => {
    const saved = session();

    expect(isDirty({ ...editorValues(saved), host: 'web-02.example' }, saved)).toBe(true);
  });

  it('notices a change in every field the form has', () => {
    /* One field left out of the comparison is one whose edits get discarded
       without a word, and it would look exactly like working. */
    const saved = session();
    const original = editorValues(saved);

    for (const [field, value] of [
      ['name', 'other'],
      ['host', 'other.example'],
      ['port', '2200'],
      ['user', 'root'],
      ['group', 'staging'],
    ] as const) {
      expect(isDirty({ ...original, [field]: value }, saved), field).toBe(true);
    }
  });

  it('forgets a change that was typed and taken back', () => {
    const saved = session();
    const original = editorValues(saved);

    expect(isDirty({ ...original, host: 'typo' }, saved)).toBe(true);
    expect(isDirty({ ...original }, saved)).toBe(false);
  });

  it('counts typing into a new session as work', () => {
    expect(isDirty({ ...EMPTY_DRAFT, host: 'db-01.example' }, null)).toBe(true);
  });
});

describe('unsaved work against a baseline', () => {
  it('sees nothing to lose right after a save', () => {
    /* Found by saving a new session in the running app: the tab kept its
       unsaved dot afterwards. Compared against a lookup in the session list,
       a freshly saved session reads as `null` until the list is refreshed
       over IPC, so a form full of stored work reported itself as unsaved. The
       baseline is what the form was last loaded *or saved* with. */
    const stored = session({ id: 'new1', name: 'gama', host: 'gama.example' });
    const settled = editorValues(stored);

    expect(differs(settled, settled)).toBe(false);
  });

  it('still notices a change made after the save', () => {
    const settled = editorValues(session());

    expect(differs({ ...settled, user: 'root' }, settled)).toBe(true);
  });

  it('is what isDirty asks of a saved session', () => {
    /* The two must not drift: `isDirty` is the same question with the
       baseline read from the session instead of carried. */
    const saved = session();

    expect(isDirty({ ...editorValues(saved), port: '2200' }, saved)).toBe(
      differs({ ...editorValues(saved), port: '2200' }, editorValues(saved)),
    );
  });
});

describe('which session the form is on', () => {
  const sessions = [session(), session({ id: 'b2', name: 'db-01' })];

  it('finds the one being edited', () => {
    expect(targetSession({ kind: 'existing', sessionId: 'b2' }, sessions)?.name).toBe('db-01');
  });

  it('has none for a new session', () => {
    expect(targetSession({ kind: 'new' }, sessions)).toBeNull();
  });

  it('has none when nothing is being edited', () => {
    expect(targetSession(null, sessions)).toBeNull();
  });

  it('has none once the session being edited is deleted', () => {
    /* Deleting from the form leaves the target pointing at an id that is
       gone. Returning the stale session would redraw the form for a host
       that no longer exists. */
    expect(targetSession({ kind: 'existing', sessionId: 'a1' }, [])).toBeNull();
  });
});
