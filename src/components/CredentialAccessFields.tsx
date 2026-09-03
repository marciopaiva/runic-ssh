import { useEffect, useRef } from 'react';
import type { JSX, RefObject } from 'react';

import { useTranslator } from '../features/settings';
import type { SuggestedMethod } from '../ipc';

interface CredentialAccessFieldsProps {
  readonly method: SuggestedMethod;
  /** Read once, synchronously, the moment Save is clicked. ADR-0057. */
  readonly formRef: RefObject<HTMLFormElement | null>;
  /** `undefined` while `SessionWizard`'s own probe is in flight. */
  readonly canRemember: boolean | undefined;
  readonly usesVault: boolean;
  /** While a test this field's own value started is still running. ADR-0058:
   * editing it mid-flight would leave the wrong value on screen once the
   * test that is actually running finishes. */
  readonly disabled: boolean;
  /** The host just refused whatever this field held, ADR-0058: the same
   * red border a duplicate host or an empty required field already gets,
   * on the field this failure is actually about. Retyping and clicking
   * Save again is the retry; there is no separate one. */
  readonly invalid: boolean;
}

/**
 * The target's own credential field, in the Access section itself rather
 * than behind Save, ADR-0057. What `InlineCredentialForm.tsx` still renders
 * for the bastion's own mid-chain case, minus the choice of method (Access
 * already asked, once, above this) and minus its own submit button: Save
 * reads this form, it does not answer it.
 *
 * Nothing typed here is ever held in React state: every field is
 * uncontrolled, read from the DOM only by `SessionWizard`'s own
 * `startProving`, through the ref this component is handed rather than one
 * it owns. `onSubmit` only stops the browser from navigating on an Enter
 * press; nothing here submits anything itself.
 */
export function CredentialAccessFields({
  method,
  formRef,
  canRemember,
  usesVault,
  disabled,
  invalid,
}: CredentialAccessFieldsProps): JSX.Element {
  const i18n = useTranslator();
  const first = useRef<HTMLElement | null>(null);
  const takeFirst = (node: HTMLElement | null): void => {
    first.current = node;
  };

  useEffect(() => {
    first.current?.focus();
  }, [method]);

  /* Refocuses and reselects the field a refusal is actually about the
     instant it is reported, the same way a browser's own "wrong password"
     already does: retyping is the very next thing anyone does with it. */
  useEffect(() => {
    if (!invalid) return;
    const node = first.current;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.focus();
      node.select();
    }
  }, [invalid]);

  const fieldClass = `${INPUT} ${invalid ? 'border-danger' : ''}`;

  return (
    <form
      ref={formRef}
      onSubmit={(event) => event.preventDefault()}
      className="mt-1 flex flex-col gap-3"
    >
      {method === 'password' ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">
            {i18n.t('credential.password')}
          </span>
          <input
            ref={takeFirst}
            name="password"
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={invalid}
            className={fieldClass}
          />
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">
              {i18n.t('credential.privateKey')}
            </span>
            <textarea
              ref={takeFirst}
              name="privateKey"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              aria-invalid={invalid}
              className={`${fieldClass} h-[124px] resize-none text-[11px] leading-snug`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">
              {i18n.t('credential.passphrase')}
            </span>
            <input
              name="passphrase"
              type="password"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              className={INPUT}
            />
          </label>
        </>
      )}

      {/* Stated, not asked, the same claim `InlineCredentialForm` made for
          the bastion's own field: the wizard is the only place a credential
          is set, so there is nothing left to ask once it has been typed. */}
      <p className="text-ink-faint text-[11px] leading-snug">
        {i18n.t(
          canRemember === true
            ? usesVault
              ? 'credential.keep.stored.vault'
              : 'credential.keep.stored'
            : 'credential.keep.forThisRun',
        )}
      </p>
    </form>
  );
}

const INPUT =
  'bg-surface-base border-line-subtle text-ink rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent';
