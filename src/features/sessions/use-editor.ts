/**
 * The host form's state, for as long as the settings tab is open.
 *
 * It lives here rather than in the panel for the reason section 6 of the
 * working agreement gives: the component stays presentational, and the state
 * outlives it. The panel is hidden whenever another tab is being looked at,
 * and a form holding its own draft would come back empty from a glance at a
 * terminal.
 *
 * Everything that decides *whether* work would be lost is in `editor.ts` and
 * tested there. This hook only sequences it.
 */

import { useCallback, useState } from 'react';

import { differs, editorValues, targetSession } from './editor';
import type { EditorTarget } from './editor';
import { invalidFields, parsePort, suggestName } from './draft';
import type { DraftField, DraftValues } from './draft';
import type { Session, SessionDraft } from '../../ipc';

/** What is waiting on the answer to "throw this away?". */
type Pending =
  | { readonly kind: 'open'; readonly target: EditorTarget }
  | { readonly kind: 'close' };

interface EditorHandlers {
  /** Answers with what was stored, including the id the core assigned. */
  readonly onSave: (draft: SessionDraft) => Promise<Session>;
  readonly onDelete: (sessionId: string) => void;
  /** Called when the settings tab may actually go away. */
  readonly onCloseSettings: () => void;
}

export interface SessionEditorState {
  readonly target: EditorTarget | null;
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  readonly dirty: boolean;
  /** Whether something is waiting on an answer about unsaved work. */
  readonly discarding: boolean;
  readonly open: (target: EditorTarget) => void;
  readonly change: (field: keyof DraftValues, value: string) => void;
  readonly submit: () => void;
  readonly remove: () => void;
  /** Asks to close the tab. Puts the question instead when there is work in it. */
  readonly requestClose: () => void;
  readonly confirmDiscard: () => void;
  readonly cancelDiscard: () => void;
}

export function useSessionEditor(
  sessions: readonly Session[],
  handlers: EditorHandlers,
): SessionEditorState {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [values, setValues] = useState<DraftValues>(() => editorValues(null));
  /* What the form was last loaded or saved with. Everything "unsaved" means is
     the distance from here. */
  const [baseline, setBaseline] = useState<DraftValues>(() => editorValues(null));
  const [wrong, setWrong] = useState<readonly DraftField[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);

  const editing = targetSession(target, sessions);
  const dirty = target !== null && differs(values, baseline);

  const show = useCallback(
    (next: EditorTarget, from: readonly Session[]): void => {
      const loaded = editorValues(targetSession(next, from));

      setTarget(next);
      setValues(loaded);
      setBaseline(loaded);
      setWrong([]);
      setPending(null);
    },
    [],
  );

  const open = useCallback(
    (next: EditorTarget): void => {
      /* Asking before replacing what is on screen. The list and the form share
         one slot, so opening another host is what throws the current one
         away. */
      if (dirty) {
        setPending({ kind: 'open', target: next });
        return;
      }

      show(next, sessions);
    },
    [dirty, sessions, show],
  );

  const change = useCallback((field: keyof DraftValues, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    /* Clearing on edit rather than re-checking: the field is being worked on,
       and a message that disappears mid-word reads as flicker. */
    setWrong((current) => current.filter((name) => name !== field));
  }, []);

  const submit = useCallback((): void => {
    /* Named after the host if it was left blank, which is what somebody would
       type if the form insisted. */
    const filled = suggestName(values);
    const problems = invalidFields(filled);

    if (problems.length > 0) {
      setValues(filled);
      setWrong(problems);
      return;
    }

    const port = parsePort(filled.port);
    if (port === null) return;

    setValues(filled);

    /* Re-aimed at what was stored, which for a new session is the first time
       the form learns its id. Without this the form stays on "new session"
       after saving one, and the tab goes on claiming unsaved work for a
       session that is already on disk. A failed save leaves the form as it
       was, with the work still in it. */
    void handlers
      .onSave({
        ...(editing === null ? {} : { id: editing.id }),
        name: filled.name.trim(),
        host: filled.host.trim(),
        port,
        user: filled.user.trim(),
        group: filled.group.trim() === '' ? null : filled.group.trim(),
      })
      .then((stored) => {
        const settled = editorValues(stored);

        setTarget({ kind: 'existing', sessionId: stored.id });
        setValues(settled);
        setBaseline(settled);
      });
  }, [values, editing, handlers]);

  const remove = useCallback((): void => {
    if (editing === null) return;

    handlers.onDelete(editing.id);
    setTarget(null);
    setValues(editorValues(null));
    setBaseline(editorValues(null));
    setWrong([]);
    setPending(null);
  }, [editing, handlers]);

  const requestClose = useCallback((): void => {
    if (dirty) {
      setPending({ kind: 'close' });
      return;
    }

    handlers.onCloseSettings();
  }, [dirty, handlers]);

  const confirmDiscard = useCallback((): void => {
    if (pending === null) return;

    if (pending.kind === 'close') {
      setTarget(null);
      setValues(editorValues(null));
      setBaseline(editorValues(null));
      setWrong([]);
      setPending(null);
      handlers.onCloseSettings();
      return;
    }

    show(pending.target, sessions);
  }, [pending, sessions, show, handlers]);

  const cancelDiscard = useCallback((): void => setPending(null), []);

  return {
    target,
    values,
    wrong,
    dirty,
    discarding: pending !== null,
    open,
    change,
    submit,
    remove,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  };
}
