import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { SessionSurface, SurfaceAction } from './SessionSurface';

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
 *
 * The filled/outlined inversion is why `onCancel` is the `primary` action and
 * `onReplace` the `secondary` one. That reads backwards against every other
 * surface in the application, and it is the point.
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
    <SessionSurface
      titleId="host-key-changed-title"
      title={i18n.t('hostKey.changed.title')}
      tone="danger"
      alert
      icon={
        <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="M8 2.4L14.6 13.6H1.4z M8 6.6v3.2M8 11.6v.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      body={i18n.t('hostKey.changed.body', { host })}
      note={
        <label className="flex flex-col gap-1.5">
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
      }
      actions={
        <>
          <SurfaceAction onClick={() => onReplace(typed)} variant="secondary" disabled={!matches}>
            {i18n.t('hostKey.changed.replace')}
          </SurfaceAction>
          <SurfaceAction onClick={onCancel} variant="primary">
            {i18n.t('hostKey.changed.cancel')}
          </SurfaceAction>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
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
    </SessionSurface>
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
