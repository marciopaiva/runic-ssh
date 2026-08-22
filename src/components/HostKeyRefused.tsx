import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

interface HostKeyRefusedProps {
  readonly host: string;
  readonly fingerprint: string;
  /** Which marker in `known_hosts` refused this. */
  readonly reason: 'revoked' | 'certificateRequired';
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
 */
export function HostKeyRefused({
  host,
  fingerprint,
  reason,
  onCancel,
}: HostKeyRefusedProps): JSX.Element {
  const i18n = useTranslator();
  const revoked = reason === 'revoked';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="host-key-refused-title"
        className="bg-surface-overlay border-danger flex w-[520px] max-w-[92vw] flex-col gap-3 rounded-lg border p-5 shadow-2xl"
      >
        <h1 id="host-key-refused-title" className="text-danger-text text-[14px] font-semibold">
          {i18n.t(revoked ? 'hostKey.revoked.title' : 'hostKey.certificate.title')}
        </h1>

        <p className="text-ink-secondary text-[12.5px] leading-relaxed text-pretty">
          {revoked
            ? i18n.t('hostKey.revoked.body')
            : i18n.t('hostKey.certificate.body', { host })}
        </p>

        <dl className="border-line-subtle flex flex-col gap-1 border-t pt-3 text-[12px]">
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

        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
          >
            {i18n.t('hostKey.action.cancel')}
          </button>
        </div>
      </section>
    </div>
  );
}
