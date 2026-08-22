import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { EMPTY_DRAFT, invalidFields, parsePort, suggestName } from '../features/sessions';
import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session, SessionDraft } from '../ipc';

interface SessionEditorProps {
  /** The session being edited, or `null` when adding one. */
  readonly session: Session | null;
  readonly onSave: (draft: SessionDraft) => void;
  readonly onDelete: (() => void) | null;
  readonly onCancel: () => void;
}

function toValues(session: Session | null): DraftValues {
  if (session === null) return EMPTY_DRAFT;

  return {
    name: session.name,
    host: session.host,
    port: String(session.port),
    user: session.user,
    group: session.group ?? '',
  };
}

/**
 * The form for a saved host.
 *
 * Nothing secret is here. A password or a passphrase is collected in its own
 * window at the moment of connecting — ADR-0008 — and a field for one on this
 * form would put it in the same document that renders terminal output, which
 * is the whole thing that decision exists to avoid.
 *
 * Errors appear per field and only after a submit. Marking a field red while
 * somebody is still typing into it is telling them they are wrong before they
 * have finished being right.
 */
export function SessionEditor({
  session,
  onSave,
  onDelete,
  onCancel,
}: SessionEditorProps): JSX.Element {
  const i18n = useTranslator();
  const [values, setValues] = useState<DraftValues>(() => toValues(session));
  const [wrong, setWrong] = useState<readonly DraftField[]>([]);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(toValues(session));
    setWrong([]);
  }, [session]);

  useEffect(() => {
    first.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const set = (field: keyof DraftValues, value: string): void => {
    setValues((current) => ({ ...current, [field]: value }));
    /* Clearing on edit rather than re-checking: the field is being worked on,
       and a message that disappears mid-word reads as flicker. */
    setWrong((current) => current.filter((name) => name !== field));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

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

    onSave({
      ...(session === null ? {} : { id: session.id }),
      name: filled.name.trim(),
      host: filled.host.trim(),
      port,
      user: filled.user.trim(),
      group: filled.group.trim() === '' ? null : filled.group.trim(),
    });
  };

  const field = (
    name: keyof DraftValues,
    label: string,
    extra: { readonly ref?: typeof first; readonly hint?: string } = {},
  ): JSX.Element => {
    const invalid = wrong.includes(name as DraftField);

    return (
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-[11px]">{label}</span>
        <input
          ref={extra.ref}
          value={values[name]}
          onChange={(event) => set(name, event.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `session-error-${name}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={`bg-surface-input text-ink rounded border px-2.5 py-1.5 font-mono text-[12.5px] outline-none ${
            invalid ? 'border-danger' : 'border-line-subtle'
          }`}
        />
        {invalid && (
          <span id={`session-error-${name}`} className="text-danger-text text-[11px]">
            {i18n.t('session.editor.invalid')}
          </span>
        )}
        {extra.hint !== undefined && !invalid && (
          <span className="text-ink-faint text-[11px]">{extra.hint}</span>
        )}
      </label>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={onSubmit}
        aria-label={i18n.t(session === null ? 'session.editor.new' : 'session.editor.edit')}
        className="bg-surface-overlay border-line-strong flex w-[440px] max-w-[92vw] flex-col gap-3 rounded-lg border p-5 shadow-2xl"
      >
        <h1 className="text-ink text-[13.5px] font-semibold">
          {i18n.t(session === null ? 'session.editor.new' : 'session.editor.edit')}
        </h1>

        {field('host', i18n.t('session.editor.host'), { ref: first })}

        <div className="grid grid-cols-[1fr_96px] gap-3">
          {field('user', i18n.t('session.editor.user'))}
          {field('port', i18n.t('session.editor.port'))}
        </div>

        {field('name', i18n.t('session.editor.name'), {
          hint: i18n.t('session.editor.nameHint'),
        })}
        {field('group', i18n.t('session.editor.group'), {
          hint: i18n.t('session.editor.groupHint'),
        })}

        <p className="text-ink-faint text-[11px] leading-snug">
          {i18n.t('session.editor.noSecret')}
        </p>

        <div className="mt-1 flex items-center gap-2">
          {onDelete !== null && (
            <button
              type="button"
              onClick={onDelete}
              className="text-danger-text hover:bg-danger-soft mr-auto rounded px-2 py-1.5 text-[12px]"
            >
              {i18n.t('session.editor.delete')}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="border-line-strong text-ink-secondary hover:text-ink ml-auto rounded border px-3 py-1.5 text-[12px]"
          >
            {i18n.t('session.editor.cancel')}
          </button>
          <button
            type="submit"
            className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
          >
            {i18n.t('session.editor.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
