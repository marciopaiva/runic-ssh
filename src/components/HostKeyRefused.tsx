import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Hop } from '../ipc';

import { JumpHostNotice } from './JumpHostNotice';
import { SessionSurface, SurfaceAction } from './SessionSurface';

interface HostKeyRefusedProps {
  readonly host: string;
  readonly fingerprint: string;
  /** Which marker in `known_hosts` refused this. */
  readonly reason: 'revoked' | 'certificateRequired';
  /** Which host in a chain this is about. */
  readonly hop: Hop;
  readonly onCancel: () => void;
}

/**
 * A host key that cannot be accepted at all.
 *
 * The other two host key screens end in a decision. These two do not, and that
 * is the point: `@revoked` and `@cert-authority` exist precisely to be
 * un-overridable, and an override on either would defeat the only purpose the
 * marker has.
 *
 * So there is one button and it cancels. The screen exists to say *why* the
 * connection stopped — without it the attempt failed with an empty window,
 * which is what it did before this component existed.
 *
 * This was the only host key screen that ever had a real backdrop. It lost it
 * to ADR-0015 along with the other four shapes, which is a loss worth naming:
 * a revoked key is the most serious thing this application reports, and it now
 * reports it in the same frame as everything else. The severity is carried by
 * the tone and the absence of any way forward, not by dimming the window.
 */
export function HostKeyRefused({
  host,
  fingerprint,
  reason,
  hop,
  onCancel,
}: HostKeyRefusedProps): JSX.Element {
  const i18n = useTranslator();
  const revoked = reason === 'revoked';

  return (
    <SessionSurface
      titleId="host-key-refused-title"
      title={i18n.t(revoked ? 'hostKey.revoked.title' : 'hostKey.certificate.title')}
      tone="danger"
      alert
      icon={
        <svg viewBox="0 0 16 16" className="h-[19px] w-[19px]" fill="none" aria-hidden="true">
          <path
            d="M8 1.8l5.4 2.2v3.6c0 3.2-2.2 5.6-5.4 6.6-3.2-1-5.4-3.4-5.4-6.6V4z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M4.6 4.6l6.8 6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
      /* Said out loud because it is the one thing the user wants to know and
         cannot see: the attempt stopped at the key, before any credential. */
      note={i18n.t('hostKey.refused.note')}
      body={
        revoked ? i18n.t('hostKey.revoked.body') : i18n.t('hostKey.certificate.body', { host })
      }
      actions={
        <SurfaceAction onClick={onCancel} variant="primary">
          {i18n.t('hostKey.action.cancel')}
        </SurfaceAction>
      }
    >
      <JumpHostNotice hop={hop} />

      <dl className="bg-surface-base border-line-subtle flex flex-col gap-2 rounded-lg border p-3.5 text-[12px]">
        <div className="flex gap-3">
          <dt className="text-ink-muted w-[92px] shrink-0">{i18n.t('hostKey.field.host')}</dt>
          <dd className="text-ink font-mono">{host}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="text-ink-muted w-[92px] shrink-0">
            {i18n.t('hostKey.field.fingerprint')}
          </dt>
          <dd className="text-ink font-mono text-[11.5px] break-all">{fingerprint}</dd>
        </div>
      </dl>
    </SessionSurface>
  );
}
