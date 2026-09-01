import type { JSX } from 'react';

import type { TransferDirection, TransferState } from '../features/sftp/browser';
import { describeSftpFailure } from '../features/sftp/failure';
import { useTranslator } from '../features/settings';
import type { TransferHandle } from '../ipc';
import type { ParameterlessKey, Translator } from '../lib/i18n';

import { formatSize } from './SftpPane';

interface TransfersBarProps {
  readonly transfers: readonly TransferState[];
  readonly onCancel: (transfer: TransferHandle) => void;
  readonly onDismiss: (transfer: TransferHandle) => void;
}

const DIRECTION_LABEL: Record<TransferDirection, ParameterlessKey> = {
  download: 'sftp.download',
  upload: 'sftp.upload',
  transfer: 'sftp.transfer',
};

function DirectionIcon({ direction }: { readonly direction: TransferDirection }): JSX.Element {
  if (direction === 'transfer') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path d="M4 9h13M13 5l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 15H7M11 11l-4 4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const down = direction === 'download';
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d={down ? 'M12 4v12M7 12l5 5 5-5' : 'M12 20V8M7 12l5-5 5 5'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TransferRow({
  i18n,
  transfer,
  onCancel,
  onDismiss,
}: {
  readonly i18n: Translator;
  readonly transfer: TransferState;
  readonly onCancel: (transfer: TransferHandle) => void;
  readonly onDismiss: (transfer: TransferHandle) => void;
}): JSX.Element {
  /* `null` until the server reports a size, which SFTP never requires it
     to: a transfer with no total still has bytes moved to show, just not
     a fraction of anything. */
  const fraction = transfer.total !== null && transfer.total > 0 ? transfer.transferred / transfer.total : null;
  const finished = transfer.status !== 'active';

  return (
    <div className="flex h-[26px] shrink-0 items-center gap-2.5">
      <span className="text-ink-faint flex h-3.5 w-3.5 shrink-0 items-center justify-center" title={i18n.t(DIRECTION_LABEL[transfer.direction])}>
        <DirectionIcon direction={transfer.direction} />
      </span>
      <span className="text-ink w-[180px] shrink-0 truncate font-mono text-[11.5px]">{transfer.name}</span>
      <span className="text-ink-faint w-[160px] shrink-0 truncate font-mono text-[10.5px]">{transfer.destination}</span>

      <div className="bg-surface-raised h-1 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${transfer.status === 'failed' ? 'bg-danger-text' : 'bg-accent'}`}
          style={{ width: `${String(finished ? 100 : (fraction ?? 0.5) * 100)}%` }}
        />
      </div>

      <span className="text-ink-muted w-[110px] shrink-0 text-right font-mono text-[10.5px]">
        {formatSize(transfer.transferred)}
        {transfer.total !== null ? ` / ${formatSize(transfer.total)}` : ''}
      </span>

      <span className="w-[90px] shrink-0 truncate text-right text-[10.5px]">
        {transfer.status === 'succeeded' && <span className="text-accent">{i18n.t('sftp.transferSucceeded')}</span>}
        {transfer.status === 'cancelled' && <span className="text-ink-faint">{i18n.t('sftp.cancelled')}</span>}
        {transfer.status === 'failed' && (
          <span className="text-danger-text" title={i18n.t(describeSftpFailure(transfer.errorCode ?? 'sftpProtocolFailed'))}>
            {i18n.t('sftp.failed')}
          </span>
        )}
      </span>

      {transfer.status === 'active' ? (
        <button
          type="button"
          onClick={() => onCancel(transfer.transfer)}
          className="text-ink-faint hover:text-ink shrink-0 text-[10.5px]"
        >
          {i18n.t('sftp.cancel')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onDismiss(transfer.transfer)}
          className="text-ink-faint hover:text-ink shrink-0 text-[10.5px]"
        >
          {i18n.t('sftp.dismiss')}
        </button>
      )}
    </div>
  );
}

/**
 * Every fan-out transfer in flight or just finished, one shared bar below
 * both columns (ADR-0047).
 *
 * `TransferState` already names its own destination per row (ADR-0045), so
 * one list loses nothing a per-pane list would keep, and it is the only
 * place that can show every active transfer at a glance. `fanout.transfers`
 * itself was already fully implemented and tested (`reduceTransfers`); this
 * is the render nothing was ever wired to (#261).
 */
export function TransfersBar({ transfers, onCancel, onDismiss }: TransfersBarProps): JSX.Element | null {
  const i18n = useTranslator();
  if (transfers.length === 0) return null;

  return (
    <div className="border-line-subtle bg-surface-panel max-h-[152px] shrink-0 overflow-y-auto border-t px-3.5 py-2">
      <div className="sticky top-0 mb-1.5 flex items-center gap-2 bg-inherit">
        <span className="text-ink-faint text-[10px] font-bold tracking-[0.1em]">{i18n.t('sftp.transfers')}</span>
        <span className="text-ink-disabled bg-surface-raised rounded px-1.5 py-px font-mono text-[9.5px] font-bold">
          {transfers.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {transfers.map((transfer) => (
          <TransferRow key={transfer.transfer} i18n={i18n} transfer={transfer} onCancel={onCancel} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
