import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useTranslator } from '../features/settings';
import { credentialStoreStatus } from '../ipc';
import type { Keep, Secret, SuggestedMethod } from '../ipc';

import { MethodPicker } from './MethodPicker';

interface InlineCredentialFormProps {
  /**
   * Fixed, or `null` meaning the form offers the choice itself.
   *
   * Fixed for the target's own credential, chosen on the wizard's own Access
   * step: ADR-0032 exists so it is asked once, not asked again. `null` for
   * a bastion's, ADR-0033: Access answered a question about the target, and
   * a different host nothing has asked about yet gets the same choice the
   * separate window always gave it, defaulting to password.
   */
  readonly method: SuggestedMethod | null;
  readonly onSubmit: (secret: Secret, keep: Keep) => void;
  readonly onCancel: () => void;
  /**
   * The session this credential is actually on the way to, when it is not
   * the one this form otherwise belongs to. ADR-0033: the same fact the
   * separate window's own banner already states for a bastion prompt,
   * reused rather than rewritten here.
   */
  readonly carrying?: string | null;
}

/**
 * The wizard's own credential field, once Access has led into the proof
 * phase. ADR-0032, and ADR-0033 for the `carrying` case.
 *
 * Everything ADR-0008 asks of the credential window applies here too, minus
 * the window itself. Nothing typed is ever held in React state: the field
 * is uncontrolled and read from the DOM only at the moment of submitting,
 * and the form is reset the instant that happens, whichever way it went.
 * What the separate window adds on top, and what this deliberately does
 * without, is a document with nothing else in it; ADR-0032 is the record of
 * why that gap was accepted for this one caller and not for any other.
 */
export function InlineCredentialForm({
  method: fixedMethod,
  onSubmit,
  onCancel,
  carrying = null,
}: InlineCredentialFormProps): JSX.Element {
  const i18n = useTranslator();
  const form = useRef<HTMLFormElement>(null);
  const first = useRef<HTMLElement | null>(null);
  const takeFirst = (node: HTMLElement | null): void => {
    first.current = node;
  };
  /* Only reachable while `fixedMethod` is `null`. Nothing else ever reads
   * or writes it, so a bastion's own choice cannot leak into the target's
   * fixed one on a later render of this same component. */
  const [chosenMethod, setChosenMethod] = useState<SuggestedMethod>('password');
  const method = fixedMethod ?? chosenMethod;
  /* `undefined` while the probe is in flight. `submit` below and the status
   * line both wait on a real answer rather than assuming a keychain exists,
   * the same caution `credential.method` in the separate window carries for
   * the same probe. */
  const [canRemember, setCanRemember] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    void credentialStoreStatus()
      .then((status) => setCanRemember(status.kind === 'available'))
      .catch(() => setCanRemember(false));
  }, []);

  useEffect(() => {
    first.current?.focus();
  }, [method]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    /* ADR-0034: not a choice read off the form any more. The wizard is the
       only place a host's credential is set, and the whole point is that
       finishing it leaves Sessions with nothing left to ask. So this keeps
       for good when there is a keychain to keep it in, and for the run when
       there is not, rather than defaulting to `'never'` and asking the
       question a checkbox used to answer. */
    const keep: Keep = canRemember === true ? 'stored' : 'forThisRun';

    const fields = new FormData(event.currentTarget);
    const passphrase = String(fields.get('passphrase') ?? '');
    const secret: Secret =
      method === 'password'
        ? { password: String(fields.get('password') ?? '') }
        : passphrase === ''
          ? { privateKey: String(fields.get('privateKey') ?? '') }
          : { privateKey: String(fields.get('privateKey') ?? ''), passphrase };

    onSubmit(secret, keep);
    form.current?.reset();
  };

  return (
    <form ref={form} onSubmit={submit} className="flex max-w-[440px] flex-col gap-3">
      {/* The same geometry the separate window's own banner uses: which
          host this credential actually belongs to, stated before the field
          asking for it rather than left to be inferred from a form that
          otherwise looks identical to the one for the host on the wizard's
          own tab. ADR-0033. */}
      {carrying !== null && (
        <p className="border-warn bg-warn-soft text-ink rounded border-l-2 px-3 py-2 text-[12.5px] leading-relaxed">
          {i18n.t('credential.hop.bastion', { target: carrying })}
        </p>
      )}

      {fixedMethod === null && <MethodPicker value={method} onChange={setChosenMethod} />}

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
            className={INPUT}
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
              className={`${INPUT} h-[124px] resize-none text-[11px] leading-snug`}
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
              className={INPUT}
            />
          </label>
        </>
      )}

      {/* Stated, not asked. ADR-0034: this form has one ending, not three.
          Reuses the separate window's own reviewed strings for the two that
          survive here rather than writing new copy for the same claim. */}
      <p className="text-ink-faint text-[11px] leading-snug">
        {i18n.t(canRemember === true ? 'credential.keep.stored' : 'credential.keep.forThisRun')}
      </p>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-secondary hover:bg-surface-raised ml-auto rounded px-2.5 py-1.5 text-[12px]"
        >
          {i18n.t('credential.cancel')}
        </button>
        <button
          type="submit"
          disabled={canRemember === undefined}
          className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {i18n.t('credential.submit')}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  'bg-surface-base border-line-subtle text-ink rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent';
