/**
 * Guards the forms that are open at once.
 *
 * There used to be one, and "is there unsaved work" was a question about *the
 * form* rather than about a host: opening a second host while the first had
 * typing in it asked you to answer for the first — a question about something
 * you were not looking at. #96 recorded that shape and parked the fix.
 *
 * What breaks here is invisible in a screenshot. Two forms that share a draft
 * look exactly like two forms that do not, right up until somebody types in one
 * and finds it in the other.
 */

import { describe, expect, it } from 'vitest';

import {
  anyDirty,
  editorDirty,
  editorKey,
  findEditor,
  settled,
  typedInto,
  updateEditor,
  withEditor,
  withoutEditor,
} from '../src/features/sessions/editors';
import type { OpenEditor } from '../src/features/sessions/editors';
import type { Session } from '../src/ipc';

function session(id: string, name: string): Session {
  return {
    id,
    name,
    host: `${name}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
  };
}

const SESSIONS = [session('a1', 'web-01'), session('b2', 'db-01')];
const NEW = { kind: 'new' } as const;
const A = { kind: 'existing', sessionId: 'a1' } as const;
const B = { kind: 'existing', sessionId: 'b2' } as const;

describe('what identifies a form', () => {
  it('separates a new form from every host', () => {
    expect(editorKey(NEW)).not.toBe(editorKey(A));
  });

  it('separates two hosts', () => {
    expect(editorKey(A)).not.toBe(editorKey(B));
  });

  it('is prefixed rather than a bare id', () => {
    /* `new_id`'s fallback in the core is `{n}-{host}` — free text that came
       from the user — so a bare id could one day collide with the word for a
       form that has no host yet. */
    expect(editorKey(A)).not.toBe('a1');
    expect(editorKey(NEW)).not.toBe('new');
  });
});

describe('opening a form', () => {
  it('loads it from the host it is on', () => {
    const [open] = withEditor([], A, SESSIONS);

    expect(open?.values.host).toBe('web-01.example');
    expect(open?.values.name).toBe('web-01');
  });

  it('starts blank for a host that does not exist yet', () => {
    const [open] = withEditor([], NEW, SESSIONS);

    expect(open?.values.host).toBe('');
  });

  it('leaves an already open form alone', () => {
    /* Somebody with half a hostname typed who clicks the same row again means
       "show me that again", not "throw that away". */
    const typed = updateEditor(withEditor([], A, SESSIONS), A, (editor) =>
      typedInto(editor, 'host', 'half-typed'),
    );

    expect(withEditor(typed, A, SESSIONS)).toBe(typed);
    expect(findEditor(withEditor(typed, A, SESSIONS), A)?.values.host).toBe('half-typed');
  });

  it('keeps the order they were opened in', () => {
    const editors = withEditor(withEditor([], B, SESSIONS), NEW, SESSIONS);

    expect(editors.map((editor) => editorKey(editor.target))).toEqual([
      editorKey(B),
      editorKey(NEW),
    ]);
  });
});

describe('unsaved work, per host', () => {
  const two = withEditor(withEditor([], A, SESSIONS), B, SESSIONS);

  it('sees nothing to lose in a form nobody touched', () => {
    expect(two.every((editor) => !editorDirty(editor))).toBe(true);
  });

  it('marks only the form that was typed into', () => {
    /* The whole reason for a form per host. With one shared slot this could
       not be asked: there was only ever one answer. */
    const typed = updateEditor(two, A, (editor) => typedInto(editor, 'host', 'changed'));

    expect(editorDirty(findEditor(typed, A) as OpenEditor)).toBe(true);
    expect(editorDirty(findEditor(typed, B) as OpenEditor)).toBe(false);
  });

  it('does not leak a keystroke from one form into another', () => {
    const typed = updateEditor(two, A, (editor) => typedInto(editor, 'user', 'root'));

    expect(findEditor(typed, B)?.values.user).toBe('deploy');
  });

  it('answers for the whole set when anything is unsaved', () => {
    expect(anyDirty(two)).toBe(false);
    expect(anyDirty(updateEditor(two, B, (editor) => typedInto(editor, 'port', '2222')))).toBe(true);
  });

  it('forgets a change that was typed and taken back', () => {
    const there = updateEditor(two, A, (editor) => typedInto(editor, 'host', 'typo'));
    const back = updateEditor(there, A, (editor) => typedInto(editor, 'host', 'web-01.example'));

    expect(editorDirty(findEditor(back, A) as OpenEditor)).toBe(false);
  });
});

describe('after a save', () => {
  it('has nothing to lose', () => {
    /* Found by saving in the running application: the tab kept its unsaved dot
       afterwards, because the form was compared against a lookup that lags the
       reload over IPC. The baseline is what it was last loaded *or saved*
       with. */
    expect(editorDirty(settled(SESSIONS[0] as Session))).toBe(false);
  });

  it('is aimed at the host that was stored', () => {
    /* For a host that did not exist this is the first time the form learns its
       id. Without it the form stays on "new session" after saving one. */
    expect(settled(SESSIONS[0] as Session).target).toEqual(A);
  });

  it('clears the fields an earlier submit marked wrong', () => {
    expect(settled(SESSIONS[0] as Session).wrong).toEqual([]);
  });
});

describe('closing a form', () => {
  it('takes only that one off the strip', () => {
    const two = withEditor(withEditor([], A, SESSIONS), B, SESSIONS);

    expect(withoutEditor(two, A).map((editor) => editorKey(editor.target))).toEqual([
      editorKey(B),
    ]);
  });

  it('is a no-op for a form that is not open', () => {
    expect(withoutEditor([], A)).toEqual([]);
  });
});
