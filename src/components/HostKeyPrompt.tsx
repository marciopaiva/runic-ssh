import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { Randomart } from './Randomart';
import { SessionSurface, SurfaceAction } from './SessionSurface';

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
 * That inert button is also what made ADR-0015 affordable. Moving this screen
 * out of a modal and into the session's panel gives up the guarantee that it
 * cannot be ignored — but the protection against answering it on reflex was
 * never the backdrop, and it survives the move intact.
 *
 * There is deliberately no "connect once". The transport has no such path —
 * accepting a key means writing it down and connecting again (see
 * `ssh::connection`), so offering the option would be a lie about what the
 * application does. The interface canvas showed one; the implementation
 * removed it rather than build a second, weaker trust path.
 *
 * Randomart sits beside the fingerprint as a recognition aid. It does not
 * arm Trust and is omitted when the fingerprint cannot be decoded.
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
    <SessionSurface
      titleId="host-key-title"
      title={i18n.t('hostKey.unknown.title')}
      icon={
        <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="M8 1.8l5.4 2.2v3.6c0 3.2-2.2 5.6-5.4 6.6-3.2-1-5.4-3.4-5.4-6.6V4z M8 6.4v2.4M8 10.6v.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
      body={i18n.t('hostKey.unknown.body', { host })}
      note={i18n.t('hostKey.savedTo')}
      actions={
        <>
          <SurfaceAction onClick={onCancel} variant="secondary">
            {i18n.t('hostKey.action.cancel')}
          </SurfaceAction>
          <SurfaceAction onClick={onTrust} variant="primary" disabled={!verified}>
            {i18n.t('hostKey.action.trust')}
          </SurfaceAction>
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <dl className="bg-surface-base border-line-subtle flex min-w-0 flex-1 flex-col gap-3 rounded-lg border p-3.5">
          <Field label={i18n.t('hostKey.field.host')} value={`${host}:${port}`} />
          <Field label={i18n.t('hostKey.field.keyType')} value={keyType} />
          <Field label={i18n.t('hostKey.field.fingerprint')} value={fingerprint} emphasis />
        </dl>

        <Randomart
          fingerprint={fingerprint}
          keyType={keyType}
          label={i18n.t('hostKey.field.randomart')}
        />
      </div>

      <label className="border-line-subtle bg-surface-base flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
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
    </SessionSurface>
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
