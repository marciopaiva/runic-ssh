import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useTranslator } from '../features/settings';
import { credentialStoreStatus, internalVaultStatus } from '../ipc';
import type { Keep, Secret, SuggestedMethod } from '../ipc';

import { MethodPicker } from './MethodPicker';

interface InlineCredentialFormProps {
  readonly onSubmit: (secret: Secret, keep: Keep) => void;
  readonly onCancel: () => void;
  /**
   * The session this credential is actually on the way to. ADR-0033: the
   * same fact the separate window's own banner already stated for a bastion
   * prompt, reused rather than rewritten here.
   */
  readonly carrying: string | null;
}

/**
 * A bastion's own credential field, mid-chain, ADR-0033: the only caller
 * left, since ADR-0057 moved the target's own field into the wizard's
 * Access section directly, read at Save rather than asked for here.
 *
 * Everything ADR-0008 asked of the credential window it replaced (ADR-0039)
 * still applies. Nothing typed is ever held in React state: the field
 * is uncontrolled and read from the DOM only at the moment of submitting,
 * and the form is reset the instant that happens, whichever way it went.
 * What the separate window adds on top, and what this deliberately does
 * without, is a document with nothing else in it; ADR-0032 is the record of
 * why that gap was accepted for this one caller and not for any other.
 */
export function InlineCredentialForm({
  onSubmit,
  onCancel,
  carrying,
}: InlineCredentialFormProps): JSX.Element {
  const i18n = useTranslator();
  const form = useRef<HTMLFormElement>(null);
  const first = useRef<HTMLElement | null>(null);
  const takeFirst = (node: HTMLElement | null): void => {
    first.current = node;
  };
  /* Access answered a question about the target; the bastion is a
     different host nothing has asked about yet, so this form still offers
     the choice itself, defaulting to password. */
  const [method, setMethod] = useState<SuggestedMethod>('password');
  /* `undefined` while the probe is in flight. `submit` below and the status
   * line both wait on a real answer rather than assuming a keychain exists,
   * the same caution `credential.method` in the separate window carries for
   * the same probe. */
  const [canRemember, setCanRemember] = useState<boolean | undefined>(undefined);
  /* ADR-0035: which store `canRemember` actually means, since `can_remember`
   * on the Rust side answers `true` for either. Read independently, so a
   * vault probe that fails leaves this `false` (the keychain wording, the
   * same fallback `can_remember` itself takes) rather than blocking the form
   * on a second round trip. */
  const [usesVault, setUsesVault] = useState(false);

  useEffect(() => {
    void credentialStoreStatus()
      .then((status) => setCanRemember(status.kind === 'available'))
      .catch(() => setCanRemember(false));
    void internalVaultStatus()
      .then((status) => setUsesVault(status !== 'notConfigured'))
      .catch(() => setUsesVault(false));
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

      <MethodPicker value={method} onChange={setMethod} />

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
        {i18n.t(
          canRemember === true
            ? usesVault
              ? 'credential.keep.stored.vault'
              : 'credential.keep.stored'
            : 'credential.keep.forThisRun',
        )}
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
