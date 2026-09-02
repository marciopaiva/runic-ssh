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

import type { DraftField, DraftValues } from './draft';
import { invalidFields, parsePort } from './draft';
import { duplicateOf } from './duplicate';
import { differs, editorValues, targetSession } from './editor';
import type { EditorTarget } from './editor';
import { jumpHostChoice } from './jump';
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
    {
      target,
      values: loaded,
      baseline: loaded,
      wrong: [],
      discarding: false,
    },
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

/**
 * Every field Save has to refuse: everything `invalidFields` already checks
 * on the values alone, plus the two the form cannot see without the file:
 * a duplicate connection target, and a jump host already carrying other
 * saved sessions that a proxy change here would silently orphan.
 * `jumpHostChoice` already returns `carried: []` for a host being created,
 * so `editing` needs no branch of its own here.
 *
 * ADR-0056: also what Save's own pre-flight check runs before handing off
 * to Access's proof phase, now that reaching Access is a click on Save
 * rather than a step transition with its own, narrower gate
 * (`wizardNext`'s old check, which never looked at `carried`). Skipping
 * this before flipping into the proving overlay is what stops a save the
 * core would refuse from landing on a settled-looking row offering
 * *Finish* for nothing that actually saved.
 */
export function wrongHostFields(
  values: DraftValues,
  saved: readonly Session[],
  editing: string | null,
): readonly DraftField[] {
  const carried = jumpHostChoice(saved, editing, values.proxyJump).carried;
  const duplicate = duplicateOf(
    saved,
    editing,
    values.host,
    parsePort(values.port),
    values.user,
    values.proxyJump,
  );

  return [
    ...invalidFields(values),
    ...(carried.length > 0 && values.proxyJump !== '' ? (['proxyJump'] as const) : []),
    ...(duplicate !== null ? (['host'] as const) : []),
  ];
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
