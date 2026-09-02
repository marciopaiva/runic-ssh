import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

interface HostGeneralFieldsProps {
  readonly values: DraftValues;
  /** The fields a submit found wrong; empty until one has been attempted. */
  readonly wrong: readonly DraftField[];
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  /**
   * The saved session already reaching this exact host, port and user, if
   * there is one. Computed live off `values`, the same way `jumpHosts` and
   * `carried` are, on `HostTopologyFields`' own side. A duplicate is knowable
   * the moment all three fields hold something, not only once a submit is
   * attempted.
   */
  readonly duplicate: Session | null;
  /**
   * Every group name already saved, for the suggestion list below the group
   * field (#221): "Production", "producao" and "Prod " forked silently into
   * three groups before this, with no way to notice short of reading every
   * saved host's group field by hand.
   */
  readonly groupNames: readonly string[];
  /** Focused on mount, when the caller wants it. */
  readonly firstRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Host, user, port, name and group: everything about a host that is not its
 * place in a chain and not the way it is reached through.
 *
 * ADR-0056: split out of `HostFields`, which drew this alongside the kind
 * picker and jump host select as one flat column. General and Topology are
 * two bordered sections now, not two halves of one block, once the wizard's
 * own two navigable steps stopped being the only place they could live
 * separately.
 */
export function HostGeneralFields({
  values,
  wrong,
  onChange,
  duplicate,
  groupNames,
  firstRef,
}: HostGeneralFieldsProps): JSX.Element {
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
    </div>
  );
}
