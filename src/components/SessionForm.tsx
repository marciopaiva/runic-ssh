import { useRef } from 'react';
import type { FormEvent, JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

interface SessionFormProps {
  readonly values: DraftValues;
  /** The fields a submit found wrong; empty until one has been attempted. */
  readonly wrong: readonly DraftField[];
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  /**
   * The saved hosts that may be chosen as a jump host.
   *
   * Already filtered by `jumpHostChoice`, so what is offered is what the core
   * will accept. A select that can only produce valid answers is a whole class
   * of refusal the user never meets.
   */
  readonly jumpHosts: readonly Session[];
  /**
   * The saved hosts reached through this one.
   *
   * Non-empty means no jump host may be chosen here, because that would make
   * their chains two hops long. They are named on screen rather than counted:
   * the reason this host is treated differently is which of the user's own
   * hosts depend on it.
   */
  readonly carried: readonly Session[];
  /** Whether the keychain holds a password for this host. */
  readonly storedCredential: boolean;
  /**
   * Drops the stored password, or `null` on a host that does not exist yet.
   *
   * Both copies go: the keychain's and the one this run may be holding. A
   * button that left the second behind would say the password was gone while
   * the next connection went on not asking for one.
   */
  readonly onForget: (() => void) | null;
  /**
   * Saves the form and collects a password by connecting once.
   *
   * The sequence is the ordinary one and that is the point of it: the host key
   * is decided before anything is typed, the password is typed in the window
   * ADR-0008 put it in, and nothing is kept until the server has accepted it.
   */
  readonly onSavePassword: () => void;
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
  jumpHosts,
  carried,
  storedCredential,
  onForget,
  onSavePassword,
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

  /* Drawn rather than left to the platform, for the reason in #163: the closed
     select is painted in the platform's own colours, and on dark that was a
     white box with a white label. */
  const jumpSelect = (invalid: boolean): JSX.Element => (
    <span className="relative block">
      <select
        value={values.proxyJump}
        onChange={(event) => onChange('proxyJump', event.target.value)}
        aria-invalid={invalid}
        className={`bg-surface-input text-ink w-full appearance-none rounded border py-1.5 pr-8 pl-2.5 text-[12.5px] outline-none ${
          invalid ? 'border-danger' : 'border-line-subtle'
        }`}
      >
        <option value="">{i18n.t('session.editor.jumpHost.none')}</option>
        {jumpHosts.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="text-ink-faint pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );

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

      {/* Absent rather than disabled when there is nothing to pick. A control
          that can never be used is a feature the user is told about and then
          denied; the first saved host makes it appear.

          A host other sessions are reached through is the one case where the
          absence is explained instead: there the field is missing because of
          something the user did elsewhere, to hosts that are not on this form,
          and an unexplained gap would read as the feature not existing. */}
      {carried.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.jumpHost')}</span>
          <span className="text-ink-faint text-[11px] leading-snug">
            {/* One key per number rather than a phrase that reads as though it
                were written for the other one. The catalogue cannot choose
                between them on its own: both take a hole, so the key has to be
                picked here where the count is. */}
            {carried.length === 1
              ? i18n.t('session.editor.jumpHost.serving.one', {
                  host: carried[0]?.name ?? '',
                })
              : i18n.t('session.editor.jumpHost.serving.many', {
                  hosts: i18n.list(carried.map((host) => host.name)),
                })}
          </span>
          {/* Only when the file already holds the state this now refuses. The
              control is there to be emptied, so it offers nothing but the value
              it has and the way out of it. */}
          {jumpHosts.length > 0 && (
            <label className="flex flex-col gap-1">
              <span
                className={`text-[11px] leading-snug ${
                  wrong.includes('proxyJump') ? 'text-danger-text' : 'text-ink-faint'
                }`}
              >
                {i18n.t('session.editor.jumpHost.clear')}
              </span>
              {jumpSelect(wrong.includes('proxyJump'))}
            </label>
          )}
        </div>
      ) : (
        jumpHosts.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.jumpHost')}</span>
            {jumpSelect(false)}
            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('session.editor.jumpHostHint')}
            </span>
          </label>
        )
      )}

      {/* What the host has, rather than a field for it. A password box on this
          form would put the secret in the document that renders terminal
          output, which is the whole of what ADR-0008 exists to avoid, and the
          window it is collected in is what makes the claim above it true. */}
      <div className="flex flex-col items-start gap-1">
        <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.credential')}</span>
        <span className="text-ink-faint text-[11px] leading-snug">
          {i18n.t(
            storedCredential ? 'session.editor.credential.stored' : 'session.editor.noSecret',
          )}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSavePassword}
            className="text-ink-secondary border-line-subtle hover:text-ink rounded border px-2 py-1 text-[11.5px]"
          >
            {i18n.t(
              storedCredential
                ? 'session.editor.credential.replace'
                : 'session.editor.credential.save',
            )}
          </button>
          {storedCredential && onForget !== null && (
            <button
              type="button"
              onClick={onForget}
              className="text-danger-text hover:bg-danger-soft rounded px-2 py-1 text-[11.5px]"
            >
              {i18n.t('session.editor.credential.forget')}
            </button>
          )}
        </div>
        <span className="text-ink-faint text-[11px] leading-snug">
          {i18n.t('session.editor.credential.saveHint')}
        </span>
      </div>

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
