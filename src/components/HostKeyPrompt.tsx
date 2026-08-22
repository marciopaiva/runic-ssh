import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

interface HostKeyPromptProps {
  readonly host: string;
  readonly port: number;
  readonly keyType: string;
  readonly fingerprint: string;
  readonly onTrust: () => void;
  readonly onCancel: () => void;
}

/**
 * The prompt for a host nobody has met.
 *
 * Rule 3 says an unknown key prompts with the fingerprint. The design decision
 * this component carries is that **trusting starts inert**: the primary button
 * does nothing until the user says they verified the fingerprint somewhere
 * else. Clicking through is the failure mode, and a button that is already
 * armed is an invitation to it.
 *
 * There is deliberately no "connect once". The transport has no such path —
 * accepting a key means writing it down and connecting again (see
 * `ssh::connection`), so offering the option would be a lie about what the
 * application does. The interface canvas showed one; the implementation
 * removed it rather than build a second, weaker trust path.
 */
export function HostKeyPrompt({
  host,
  port,
  keyType,
  fingerprint,
  onTrust,
  onCancel,
}: HostKeyPromptProps): JSX.Element {
  const i18n = useTranslator();
  const [verified, setVerified] = useState(false);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-key-title"
      className="bg-surface-overlay border-line-strong w-[620px] rounded-xl border shadow-2xl"
    >
      <div className="flex items-start gap-3.5 px-6 pt-5 pb-4">
        <div className="border-line-strong bg-surface-raised text-accent-bright flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border">
          <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
            <path
              d="M8 1.8l5.4 2.2v3.6c0 3.2-2.2 5.6-5.4 6.6-3.2-1-5.4-3.4-5.4-6.6V4z M8 6.4v2.4M8 10.6v.1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 id="host-key-title" className="text-ink text-[17px] font-bold tracking-tight">
            {i18n.t('hostKey.unknown.title')}
          </h2>
          <p className="text-ink-muted text-[13px] leading-relaxed text-pretty">
            {i18n.t('hostKey.unknown.body', { host })}
          </p>
        </div>
      </div>

      <dl className="bg-surface-base border-line-subtle mx-6 mb-4 flex flex-col gap-3 rounded-lg border p-3.5">
        <Field label={i18n.t('hostKey.field.host')} value={`${host}:${port}`} />
        <Field label={i18n.t('hostKey.field.keyType')} value={keyType} />
        <Field
          label={i18n.t('hostKey.field.fingerprint')}
          value={fingerprint}
          emphasis
        />
      </dl>

      <label className="border-line-subtle bg-surface-base mx-6 mb-4 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
        <input
          type="checkbox"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
          className="accent-accent mt-0.5 h-4 w-4"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-ink-secondary text-[12.5px] font-semibold">
            {i18n.t('hostKey.verify.label')}
          </span>
          <span className="text-ink-muted text-[11.5px] leading-snug">
            {i18n.t('hostKey.verify.hint')}
          </span>
        </span>
      </label>

      <footer className="border-line-subtle bg-surface-chrome flex flex-col gap-2.5 rounded-b-xl border-t px-6 py-3.5">
        <span className="text-ink-faint text-[11.5px]">{i18n.t('hostKey.savedTo')}</span>
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="border-line-strong text-ink-secondary h-[34px] rounded-md border px-4 text-[12.5px] font-semibold"
          >
            {i18n.t('hostKey.action.cancel')}
          </button>
          <button
            type="button"
            onClick={onTrust}
            disabled={!verified}
            className="bg-accent text-surface-base h-[34px] rounded-md px-[18px] text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {i18n.t('hostKey.action.trust')}
          </button>
        </div>
      </footer>
    </section>
  );
}

function Field({
  label,
  value,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">{label}</dt>
      <dd
        className={`font-mono text-[12.5px] break-all ${
          emphasis ? 'text-accent-bright font-bold' : 'text-ink-secondary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
