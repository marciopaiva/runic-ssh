import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

interface HostKeyBlockedProps {
  readonly host: string;
  readonly storedFingerprints: readonly string[];
  readonly offeredFingerprint: string;
  readonly onReplace: (confirmation: string) => void;
  readonly onCancel: () => void;
}

/**
 * A host key that changed.
 *
 * Rule 3 says a changed key blocks, and that the override must not be the
 * default button. Three things carry that here, and none of them is styling
 * alone:
 *
 * - the safe action is the **only filled button**, so the eye lands on it
 * - the override needs the host name typed back, which cannot be done by
 *   reflex
 * - the core checks that typing too. Enforced only here it would be
 *   decoration: the core is what writes the file.
 */
export function HostKeyBlocked({
  host,
  storedFingerprints,
  offeredFingerprint,
  onReplace,
  onCancel,
}: HostKeyBlockedProps): JSX.Element {
  const i18n = useTranslator();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === host;

  return (
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="host-key-changed-title"
      className="bg-surface-overlay border-danger/50 w-[640px] overflow-hidden rounded-xl border shadow-2xl"
    >
      <div className="bg-danger h-[3px]" />

      <div className="flex items-start gap-3.5 px-6 pt-5 pb-4">
        <div className="border-danger/60 bg-danger-soft text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border">
          <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
            <path
              d="M8 2.4L14.6 13.6H1.4z M8 6.6v3.2M8 11.6v.1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2
            id="host-key-changed-title"
            className="text-danger-text text-[17px] font-bold tracking-tight"
          >
            {i18n.t('hostKey.changed.title')}
          </h2>
          <p className="text-ink-muted text-[13px] leading-relaxed text-pretty">
            {i18n.t('hostKey.changed.body', { host })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-6 pb-4">
        <Fingerprint
          label={i18n.t('hostKey.changed.trusted')}
          values={storedFingerprints}
          tone="ok"
        />
        <Fingerprint
          label={i18n.t('hostKey.changed.offered')}
          values={[offeredFingerprint]}
          tone="danger"
        />
      </div>

      <footer className="border-line-subtle bg-surface-chrome flex items-end gap-2.5 border-t px-6 py-3.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.07em]">
            {i18n.t('hostKey.changed.confirmPrompt')}
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={host}
            autoComplete="off"
            spellCheck={false}
            className="bg-surface-input border-line-strong text-ink h-[30px] w-[220px] rounded-md border px-2.5 font-mono text-xs"
          />
        </label>

        <button
          type="button"
          onClick={() => onReplace(typed)}
          disabled={!matches}
          className="border-line-strong text-ink-muted h-[34px] rounded-md border px-4 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {i18n.t('hostKey.changed.replace')}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="bg-ink text-surface-base h-[34px] rounded-md px-5 text-[12.5px] font-bold"
        >
          {i18n.t('hostKey.changed.cancel')}
        </button>
      </footer>
    </section>
  );
}

function Fingerprint({
  label,
  values,
  tone,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly tone: 'ok' | 'danger';
}): JSX.Element {
  const skin =
    tone === 'ok'
      ? 'border-ok/40 bg-ok-soft text-ok'
      : 'border-danger/50 bg-danger-soft text-danger-text';

  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border p-3.5 ${skin}`}>
      <span className="text-[9.5px] font-bold tracking-[0.09em] opacity-80">{label}</span>
      {values.map((value) => (
        <span key={value} className="font-mono text-[13px] font-bold break-all">
          {value}
        </span>
      ))}
    </div>
  );
}
