import { useEffect } from 'react';
import type { JSX } from 'react';

import { describeSftpFailure } from '../features/sftp/failure';
import { usePane } from '../features/sftp/use-pane';
import type { Endpoint, PaneEntry } from '../features/sftp/endpoint';
import { useTranslator } from '../features/settings';
import type { Translator } from '../lib/i18n';

interface SftpPaneProps {
  readonly endpoint: Endpoint;
  /** `App.tsx`'s `SOURCE_PANE_ID`/`destinationPaneId(slot)`: how this
   * pane's own report is told apart from every other one's. */
  readonly paneId: string;
  /** `sftp.source`/`sftp.destination`, the small caption above the identity. */
  readonly label: string;
  /** `user@host` or `localhost`, drawn beside `label`. */
  readonly identity: string;
  /** Reports where this pane currently is, and how to make it look again,
   * up to the fan-out orchestration: `useFanout`'s own `reportPane`.
   * Called with `null` on unmount. */
  readonly onReport: (paneId: string, report: { readonly path: string | null; readonly reload: () => void } | null) => void;
  /** Present only on the source pane: sends a file to every occupied
   * destination. `null` on a destination pane, which only ever receives. */
  readonly onSend: ((entry: PaneEntry) => void) | null;
  /** A destination slot's own way to clear itself, drawn beside its
   * identity. `null` on the source, which has nothing to clear to. */
  readonly onClear: (() => void) | null;
}

/** The folder icon, also drawn on the rail's own SFTP slot and the sidebar. */
export function FolderIcon({ className }: { readonly className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 6.5h6l1.6 2H20v9.5H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileIcon({ className }: { readonly className: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M6 3h8l4 4v14H6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** `4.2 kB`, `318 kB`, `1.1 MB`. Not localised: a unit abbreviation, not a
 * sentence, and the same three letters read the same in every catalogue
 * this application ships. */
export function formatSize(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = unit === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

export function formatModified(unixSecs: number | null): string {
  if (unixSecs === null) return '';
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RowProps {
  readonly name: string;
  readonly isDir: boolean;
  readonly size: number;
  readonly modifiedUnixSecs: number | null;
  readonly onOpen: () => void;
  readonly onSend: (() => void) | null;
  readonly sendLabel: string;
}

function Row({ name, isDir, size, modifiedUnixSecs, onOpen, onSend, sendLabel }: RowProps): JSX.Element {
  return (
    <div className="hover:bg-surface-raised/40 group flex items-center gap-2.5 px-2.5 py-[3px]">
      <button
        type="button"
        onClick={onOpen}
        disabled={!isDir}
        className="text-ink2 flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
      >
        {isDir ? (
          <FolderIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        ) : (
          <FileIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        )}
        <span className="text-ink truncate font-mono text-[12px]">{name}</span>
      </button>
      <span className="text-ink-muted w-[74px] shrink-0 text-right font-mono text-[11.5px]">
        {isDir ? '—' : formatSize(size)}
      </span>
      <span className="text-ink-faint w-[96px] shrink-0 text-right font-mono text-[11px]">
        {formatModified(modifiedUnixSecs)}
      </span>
      {onSend !== null && (
        <button
          type="button"
          onClick={onSend}
          aria-label={sendLabel}
          title={sendLabel}
          className="text-ink-faint hover:text-accent flex h-4 w-4 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M2 8h10M8 3.5L12.5 8 8 12.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function Header({ i18n }: { readonly i18n: Translator }): JSX.Element {
  return (
    <div className="text-ink-faint flex items-center gap-2.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.08em]">
      <span className="flex-1">{i18n.t('sftp.column.name')}</span>
      <span className="w-[74px] text-right">{i18n.t('sftp.column.size')}</span>
      <span className="w-[96px] text-right">{i18n.t('sftp.column.modified')}</span>
      <span className="w-4 shrink-0" />
    </div>
  );
}

/**
 * One pane: the source, or one destination slot. ADR-0045.
 *
 * Replaces #127's `SftpBrowser`, which owned a hardcoded local pane and a
 * hardcoded remote pane side by side. One of these is mounted per occupied
 * slot instead, each against whatever `Endpoint` it was dropped there:
 * `usePane` inside it does not know or care whether that endpoint is local
 * or remote.
 */
export function SftpPane({
  endpoint,
  paneId,
  label,
  identity,
  onReport,
  onSend,
  onClear,
}: SftpPaneProps): JSX.Element {
  const i18n = useTranslator();
  const pane = usePane(endpoint);

  useEffect(() => {
    onReport(paneId, { path: pane.path, reload: () => pane.enter(pane.path) });
    return () => onReport(paneId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, pane.path, pane.enter, onReport]);

  const open = (entry: PaneEntry): void => {
    if (entry.isDir) pane.enter(entry.path);
  };

  return (
    <div className="border-line-subtle bg-surface-terminal flex h-full flex-col overflow-hidden rounded border">
      <div className="border-line-subtle bg-surface-chrome flex h-8 shrink-0 items-center gap-2.5 border-b px-2.5">
        <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.1em]">{label}</span>
        <span className="text-ink-muted truncate font-mono text-[11px]">{identity}</span>
        <span className="text-ink-disabled truncate font-mono text-[10.5px]">{pane.path ?? ''}</span>
        <div className="flex-1" />
        {onClear !== null && (
          <button
            type="button"
            onClick={onClear}
            aria-label={i18n.t('sftp.clearSlot')}
            title={i18n.t('sftp.clearSlot')}
            className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center"
          >
            <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <Header i18n={i18n} />
        {pane.error !== null && (
          <p className="text-danger-text px-2.5 py-2 text-[12px]">{i18n.t(describeSftpFailure(pane.error))}</p>
        )}
        {pane.error === null && pane.parent !== null && (
          <Row
            name=".."
            isDir
            size={0}
            modifiedUnixSecs={null}
            onOpen={() => pane.enter(pane.parent)}
            onSend={null}
            sendLabel=""
          />
        )}
        {pane.error === null && !pane.loading && pane.entries.length === 0 && (
          <p className="text-ink-faint px-2.5 py-2 text-[12px]">{i18n.t('sftp.empty')}</p>
        )}
        {pane.error === null &&
          pane.entries.map((entry) => (
            <Row
              key={entry.path}
              name={entry.name}
              isDir={entry.isDir}
              size={entry.size}
              modifiedUnixSecs={entry.modifiedUnixSecs}
              onOpen={() => open(entry)}
              onSend={onSend === null || entry.isDir ? null : () => onSend(entry)}
              sendLabel={i18n.t('sftp.sendToDestinations')}
            />
          ))}
      </div>
    </div>
  );
}
