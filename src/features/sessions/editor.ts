/**
 * The state of the host form, apart from the markup that draws it.
 *
 * The form used to be a modal: it appeared, it was answered, and whatever was
 * typed into it died with it. Inside the settings tab it outlives being looked
 * at — the tab stays on the strip, and somebody can wander off to another
 * session and come back — so "has this been changed" becomes a question the
 * interface has to be able to answer, and answer the same way every time.
 *
 * Pure, because the alternative is asserting it through a rendered form.
 */

import type { Session } from '../../ipc';

import { EMPTY_DRAFT } from './draft';
import type { DraftValues } from './draft';

/** Which host the form is showing: a saved one, or one that does not exist yet. */
export type EditorTarget =
  | { readonly kind: 'new' }
  | { readonly kind: 'existing'; readonly sessionId: string };

/** The form's contents for a saved session, or the blank form for a new one. */
export function editorValues(session: Session | null): DraftValues {
  if (session === null) return EMPTY_DRAFT;

  return {
    name: session.name,
    host: session.host,
    port: String(session.port),
    user: session.user,
    group: session.group ?? '',
    proxyJump: session.proxyJump ?? '',
  };
}

/**
 * Whether the form has moved away from what it was last loaded or saved with.
 *
 * Against a baseline rather than a flag set on the first keystroke: typing a
 * character and deleting it again leaves nothing to lose, and a marker that
 * stays lit after that teaches people to ignore it.
 *
 * The baseline is passed in rather than looked up from the session list. After
 * a save the list is refreshed over IPC, and for the moment between the answer
 * arriving and the list catching up, a lookup finds nothing and reports a form
 * full of freshly saved work as unsaved.
 */
export function differs(values: DraftValues, baseline: DraftValues): boolean {
  return (
    values.name !== baseline.name ||
    values.host !== baseline.host ||
    values.port !== baseline.port ||
    values.user !== baseline.user ||
    values.group !== baseline.group ||
    values.proxyJump !== baseline.proxyJump
  );
}

/** Whether the form holds work that closing it would throw away. */
export function isDirty(values: DraftValues, session: Session | null): boolean {
  return differs(values, editorValues(session));
}

/** The session a target points at, or `null` for a new one or a vanished id. */
export function targetSession(
  target: EditorTarget | null,
  sessions: readonly Session[],
): Session | null {
  if (target === null || target.kind === 'new') return null;

  return sessions.find((session) => session.id === target.sessionId) ?? null;
}
