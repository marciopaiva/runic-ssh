import { useRef } from 'react';
import type { FormEvent, JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';

interface SessionFormProps {
  readonly values: DraftValues;
  /** The fields a submit found wrong; empty until one has been attempted. */
  readonly wrong: readonly DraftField[];
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  readonly onSubmit: () => void;
  /** `null` for a session that does not exist yet. */
  readonly onDelete: (() => void) | null;
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
 *
 * Presentational: it holds no draft of its own. The values live in the shell
 * because the settings tab outlives being looked at, and a form that kept its
 * own copy would lose it the moment somebody glanced at a terminal.
 */
export function SessionForm({
  values,
  wrong,
  onChange,
  onSubmit,
  onDelete,
}: SessionFormProps): JSX.Element {
  const i18n = useTranslator();
  const first = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit();
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
          onChange={(event) => onChange(name, event.target.value)}
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
    <form onSubmit={submit} className="flex max-w-[440px] flex-col gap-3">
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
          type="submit"
          className="bg-accent text-surface-base ml-auto rounded px-3 py-1.5 text-[12px] font-semibold"
        >
          {i18n.t('session.editor.save')}
        </button>
      </div>
    </form>
  );
}
