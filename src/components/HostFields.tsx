import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

import { HostKindPicker } from './HostKindPicker';

interface HostFieldsProps {
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
  /**
   * The saved session already reaching this exact host, port and user, if
   * there is one. Computed live off `values`, the same way `jumpHosts` and
   * `carried` are. A duplicate is knowable the moment all three fields hold
   * something, not only once a submit is attempted.
   */
  readonly duplicate: Session | null;
  /**
   * Every group name already saved, for the suggestion list below the group
   * field (#221): "Production", "producao" and "Prod " forked silently into
   * three groups before this, with no way to notice short of reading every
   * saved host's group field by hand.
   */
  readonly groupNames: readonly string[];
  /** Focused on mount, when the caller wants it. The wizard's Host step
   * does, so this is the caller's call and not a fixed choice. */
  readonly firstRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Everything about a host that is not a secret and not the way it is reached
 * through: name, address, group, jump host, and the ADR-0031 kind picker.
 *
 * Extracted out of `SessionForm` so ADR-0030's wizard can draw the same
 * fields in its own first step without a second, drifting copy of the
 * validation-linked markup. Presentational, like the form it came from: the
 * values live in whichever caller holds the draft.
 */
export function HostFields({
  values,
  wrong,
  onChange,
  jumpHosts,
  carried,
  duplicate,
  groupNames,
  firstRef,
}: HostFieldsProps): JSX.Element {
  const i18n = useTranslator();
  const [groupOpen, setGroupOpen] = useState(false);
  const groupBox = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    if (!groupOpen) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || groupBox.current?.contains(event.target) !== true) {
        setGroupOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [groupOpen]);

  const field = (
    name: keyof DraftValues,
    label: string,
    extra: {
      readonly ref?: RefObject<HTMLInputElement | null> | undefined;
      readonly hint?: string;
    } = {},
  ): JSX.Element => {
    /* The host field also turns red for a duplicate target, without the
       generic text below it. The paragraph under the user/port row already
       says which host it collides with, and showing both would be the same
       fact twice in two different sentences. */
    const duplicateHere = name === 'host' && duplicate !== null;
    const invalid = wrong.includes(name as DraftField) || duplicateHere;

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
        {invalid && !duplicateHere && (
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

  /* Uppercased as it is typed rather than only displayed that way: the most
     common fork this issue names is the same word cased two ways, and
     forcing one case on the value itself, not just on screen, is what stops
     "Production" and "production" ever becoming two groups in the first
     place. The suggestion list below covers the fork a case rule cannot,
     the same word spelled two different ways. */
  const groupSuggestions = groupNames.filter(
    (name) => name.includes(values.group.trim()) && name !== values.group.trim(),
  );
  const groupInvalid = wrong.includes('group');

  const groupField = (): JSX.Element => (
    <label ref={groupBox} className="relative flex flex-col gap-1">
      <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.group')}</span>
      <input
        value={values.group}
        onChange={(event) => onChange('group', event.target.value.toUpperCase())}
        onFocus={() => setGroupOpen(true)}
        aria-invalid={groupInvalid}
        aria-describedby={groupInvalid ? 'session-error-group' : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`bg-surface-input text-ink rounded border px-2.5 py-1.5 font-mono text-[12.5px] outline-none ${
          groupInvalid ? 'border-danger' : 'border-line-subtle'
        }`}
      />
      {groupInvalid && (
        <span id="session-error-group" className="text-danger-text text-[11px]">
          {i18n.t('session.editor.invalid')}
        </span>
      )}
      {!groupInvalid && (
        <span className="text-ink-faint text-[11px]">{i18n.t('session.editor.groupHint')}</span>
      )}

      {groupOpen && groupSuggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={i18n.t('session.editor.group')}
          className="bg-surface-overlay border-line-strong absolute top-full left-0 z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border shadow-2xl"
        >
          {groupSuggestions.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onChange('group', name);
                setGroupOpen(false);
              }}
              className="text-ink-secondary hover:bg-surface-raised/60 flex h-7 w-full items-center px-2.5 text-left font-mono text-[12.5px]"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </label>
  );

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
    <div className="flex flex-col gap-3">
      {field('host', i18n.t('session.editor.host'), { ref: firstRef })}

      <div className="grid grid-cols-[1fr_96px] gap-3">
        {field('user', i18n.t('session.editor.user'))}
        {field('port', i18n.t('session.editor.port'))}
      </div>

      {duplicate !== null && (
        <p className="border-danger bg-danger-soft text-ink rounded border-l-2 px-3 py-2 text-[12.5px] leading-relaxed">
          {i18n.t('session.editor.duplicate', { name: duplicate.name })}
        </p>
      )}

      {field('name', i18n.t('session.editor.name'), {
        hint: i18n.t('session.editor.nameHint'),
      })}
      {groupField()}

      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-[11px]">{i18n.t('hostKind.label')}</span>
        <HostKindPicker value={values.kind} onChange={(kind) => onChange('kind', kind)} />
      </div>

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
    </div>
  );
}
