import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Hop } from '../ipc';

import { JumpHostNotice } from './JumpHostNotice';
import { Randomart } from './Randomart';

interface InlineHostKeyChallengeProps {
  readonly host: string;
  readonly port: number;
  readonly keyType: string;
  readonly fingerprint: string;
  readonly hop: Hop;
  readonly onTrust: () => void;
  readonly onCancel: () => void;
}

/**
 * The prompt for a host nobody has met, inside Access rather than above the
 * whole form.
 *
 * `HostKeyPrompt` draws the same decision as a standalone card, the shape
 * Sessions still uses over a group's terminal; that card never got its own
 * design pass for sitting inside this narrower section, and arrived reading
 * like a screen dropped onto another one rather than a part of it. Reported
 * live, 2026-09-07: "fizemos todo o fluxo de cadastro e alteracao do host,
 * mas nao incluimos esse card no fluxo." This is the same content
 * (`HostKeyPrompt`'s own doc comment on the inert Trust button and the
 * missing "connect once" still applies here) at Access's own width: fields
 * stacked rather than beside the randomart, which a fingerprint wrapped
 * next to a fixed-width art block reads worse than.
 *
 * `HostKeyBlocked` and `HostKeyRefused` are not redrawn here. Only the
 * plain unknown-key decision, the one this component answers, was taken
 * through a design pass; the other two keep rendering where `testSurface`
 * already put them until they get one too.
 */
export function InlineHostKeyChallenge({
  host,
  port,
  keyType,
  fingerprint,
  hop,
  onTrust,
  onCancel,
}: InlineHostKeyChallengeProps): JSX.Element {
  const i18n = useTranslator();
  const [verified, setVerified] = useState(false);

  return (
    <div className="border-line-subtle flex flex-col gap-3 border-t pt-4">
      <JumpHostNotice hop={hop} />

      <div className="flex items-center gap-2">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" className="text-warn shrink-0">
          <path
            d="M8 1.8l5.4 2.2v3.6c0 3.2-2.2 5.6-5.4 6.6-3.2-1-5.4-3.4-5.4-6.6V4z M8 6.4v2.4M8 10.6v.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-ink text-[12.5px] font-bold">{i18n.t('hostKey.unknown.title')}</span>
      </div>

      <p className="text-ink-secondary text-[11.5px] leading-relaxed">
        {i18n.t('hostKey.unknown.body', { host })}
      </p>

      <dl className="flex flex-col gap-2.5">
        <Field label={i18n.t('hostKey.field.host')} value={`${host}:${port}`} />
        <Field label={i18n.t('hostKey.field.keyType')} value={keyType} />
        <Field label={i18n.t('hostKey.field.fingerprint')} value={fingerprint} emphasis />
      </dl>

      <Randomart fingerprint={fingerprint} keyType={keyType} label={i18n.t('hostKey.field.randomart')} />

      <label className="border-line-subtle bg-surface-base flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5">
        <input
          type="checkbox"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
          className="accent-accent mt-0.5 h-4 w-4"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-ink-secondary text-[12px] font-semibold">
            {i18n.t('hostKey.verify.label')}
          </span>
          <span className="text-ink-muted text-[11px] leading-snug">{i18n.t('hostKey.verify.hint')}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-faint text-[10.5px]">{i18n.t('hostKey.savedTo')}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-secondary hover:bg-surface-raised rounded px-2.5 py-1.5 text-[12px]"
        >
          {i18n.t('hostKey.action.cancel')}
        </button>
        <button
          type="button"
          onClick={onTrust}
          disabled={!verified}
          className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {i18n.t('hostKey.action.trust')}
        </button>
      </div>
    </div>
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
        className={`font-mono text-[12px] break-all ${
          emphasis ? 'text-accent-bright font-bold' : 'text-ink-secondary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
