/**
 * Every host form that is open at once.
 *
 * There used to be one, held in a hook, and the tab strip had one editor slot.
 * That made "is there unsaved work" a question about *the form* rather than
 * about a host: opening a second host while the first had typing in it asked
 * you to answer for the first, which is a question about something you were not
 * looking at. #96 recorded that as a known shape and the fix as a form per host.
 *
 * A form per host cannot live in a hook — `useSessionEditor` in a loop breaks
 * the rules of hooks the moment a tab opens or closes. So the drafts live here
 * as data, the shell holds the list, and every operation is a pure function
 * over it. That is the same trade the rest of this feature already makes: what
 * decides anything is testable without a DOM, and the component only draws.
 */

import { EMPTY_DRAFT } from './draft';
import type { DraftField, DraftValues } from './draft';
import { differs, editorValues, targetSession } from './editor';
import type { EditorTarget } from './editor';
import type { Session } from '../../ipc';

/** One open form. `baseline` is what it was last loaded *or saved* with. */
export interface OpenEditor {
  readonly target: EditorTarget;
  readonly values: DraftValues;
  readonly baseline: DraftValues;
  /** The fields a submit found wrong; empty until one has been attempted. */
  readonly wrong: readonly DraftField[];
  /** Whether this form is waiting on an answer about throwing work away. */
  readonly discarding: boolean;
}

/**
 * What identifies a form on the strip.
 *
 * Prefixed rather than bare: a session id is sixteen hex characters, but
 * `new_id`'s fallback in the core is `{n}-{host}` — free text that came from
 * the user — so a bare id could one day collide with the word for a form that
 * has no host yet.
 */
export function editorKey(target: EditorTarget): string {
  return target.kind === 'new' ? 'editor:new' : `editor:host:${target.sessionId}`;
}

export function findEditor(
  editors: readonly OpenEditor[],
  target: EditorTarget,
): OpenEditor | null {
  const key = editorKey(target);

  return editors.find((editor) => editorKey(editor.target) === key) ?? null;
}

/** Whether this form holds work that closing it would throw away. */
export function editorDirty(editor: OpenEditor): boolean {
  return differs(editor.values, editor.baseline);
}

/** Whether *any* open form does. What the shell asks before quitting. */
export function anyDirty(editors: readonly OpenEditor[]): boolean {
  return editors.some(editorDirty);
}

/**
 * Opens a form for this host, or leaves the one already open alone.
 *
 * Deliberately not reloading an open form from the session list. Somebody with
 * half a hostname typed who clicks the same row again means "show me that
 * again", not "throw that away" — and reloading would be the second of those
 * without asking.
 */
export function withEditor(
  editors: readonly OpenEditor[],
  target: EditorTarget,
  sessions: readonly Session[],
): readonly OpenEditor[] {
  if (findEditor(editors, target) !== null) return editors;

  const loaded = editorValues(targetSession(target, sessions));

  return [
    ...editors,
    { target, values: loaded, baseline: loaded, wrong: [], discarding: false },
  ];
}

export function withoutEditor(
  editors: readonly OpenEditor[],
  target: EditorTarget,
): readonly OpenEditor[] {
  const key = editorKey(target);

  return editors.filter((editor) => editorKey(editor.target) !== key);
}

/** Replaces one form, leaving every other one exactly as it was. */
export function updateEditor(
  editors: readonly OpenEditor[],
  target: EditorTarget,
  change: (editor: OpenEditor) => OpenEditor,
): readonly OpenEditor[] {
  const key = editorKey(target);

  return editors.map((editor) => (editorKey(editor.target) === key ? change(editor) : editor));
}

/** A field was typed into. */
export function typedInto(
  editor: OpenEditor,
  field: keyof DraftValues,
  value: string,
): OpenEditor {
  return {
    ...editor,
    values: { ...editor.values, [field]: value },
    /* Cleared on edit rather than re-checked: the field is being worked on, and
       a message that disappears mid-word reads as flicker. */
    wrong: editor.wrong.filter((name) => name !== field),
    discarding: false,
  };
}

/**
 * A form that has just been saved, re-aimed at what was stored.
 *
 * For a host that did not exist this is the first time the form learns its id.
 * Without it the form stays on "new session" after saving one, and the tab goes
 * on claiming unsaved work for a host that is already on disk.
 */
export function settled(stored: Session): OpenEditor {
  const values = editorValues(stored);

  return {
    target: { kind: 'existing', sessionId: stored.id },
    values,
    baseline: values,
    wrong: [],
    discarding: false,
  };
}

/** A blank form for a host that does not exist yet. */
export function blankEditor(): OpenEditor {
  return {
    target: { kind: 'new' },
    values: EMPTY_DRAFT,
    baseline: EMPTY_DRAFT,
    wrong: [],
    discarding: false,
  };
}
