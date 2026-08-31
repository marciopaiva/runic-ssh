import { useEffect } from 'react';
import type { JSX } from 'react';

import { hasActiveTransfer } from '../features/sftp/browser';
import type { TransferState } from '../features/sftp/browser';
import { describeSftpFailure } from '../features/sftp/failure';
import { useSftpBrowser } from '../features/sftp/use-browser';
import type { SftpRemoteView } from '../features/sftp/use-browser';
import type { LocalEntry, SessionHandle, SftpEntry } from '../ipc';
import { useTranslator } from '../features/settings';
import type { Translator } from '../lib/i18n';

interface SftpBrowserProps {
  readonly sessionId: string;
  readonly handle: SessionHandle;
  readonly visible: boolean;
  readonly frame: React.CSSProperties;
  readonly id: string;
  readonly labelledBy: string;
  /** The remote side of this tab's browser, one level up: the sidebar tree
   * (`SftpSidebar.tsx`) renders in a different part of the page and reads
   * this same `remotePath`/`enterRemote` rather than keeping its own idea
   * of where the remote pane is. Called with `null` on unmount. */
  readonly onRemoteChange: (sessionId: string, remote: SftpRemoteView | null) => void;
}

/** The folder icon, also drawn on the tab itself and the sidebar tree. */
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
function formatSize(bytes: number): string {
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

function formatModified(unixSecs: number | null): string {
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
  readonly onTransfer: (() => void) | null;
  readonly transferLabel: string;
}

function Row({ name, isDir, size, modifiedUnixSecs, onOpen, onTransfer, transferLabel }: RowProps): JSX.Element {
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
      {onTransfer !== null && (
        <button
          type="button"
          onClick={onTransfer}
          aria-label={transferLabel}
          title={transferLabel}
          className="text-ink-faint hover:text-accent flex h-4 w-4 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 14h10"
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

function TransferRow({
  entry,
  i18n,
  onCancel,
  onDismiss,
}: {
  readonly entry: TransferState;
  readonly i18n: Translator;
  readonly onCancel: () => void;
  readonly onDismiss: () => void;
}): JSX.Element {
  const fraction =
    entry.total !== null && entry.total > 0 ? Math.min(1, entry.transferred / entry.total) : null;

  return (
    <div className="flex items-center gap-3 px-3.5 py-1.5">
      <svg
        viewBox="0 0 24 24"
        className={`h-3.5 w-3.5 shrink-0 ${
          entry.status === 'failed' ? 'text-danger-text' : 'text-accent'
        }`}
        fill="none"
        aria-hidden="true"
      >
        {entry.direction === 'download' ? (
          <path
            d="M12 4v11M8 11l4 4 4-4M5 20h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M12 20V9M8 13l4-4 4 4M5 4h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <span className="text-ink w-[140px] shrink-0 truncate font-mono text-[12px]">{entry.name}</span>

      {entry.status === 'active' && (
        <>
          <div className="bg-surface-raised h-1 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full"
              style={{ width: fraction === null ? '100%' : `${String(fraction * 100)}%` }}
            />
          </div>
          <span className="text-ink-muted w-[116px] shrink-0 text-right font-mono text-[11.5px]">
            {formatSize(entry.transferred)}
            {entry.total !== null ? ` / ${formatSize(entry.total)}` : ''}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-faint hover:text-ink shrink-0 text-[11px]"
          >
            {i18n.t('sftp.cancel')}
          </button>
        </>
      )}

      {entry.status === 'succeeded' && (
        <span className="text-ok flex-1 truncate text-[11.5px]">{i18n.t('sftp.transferSucceeded')}</span>
      )}

      {entry.status === 'failed' && (
        <span className="text-danger-text flex-1 truncate text-[11.5px]">
          {entry.errorCode !== null ? i18n.t(describeSftpFailure(entry.errorCode)) : ''}
        </span>
      )}

      {entry.status !== 'active' && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={i18n.t('sftp.dismiss')}
          className="text-ink-faint hover:text-ink shrink-0"
        >
          <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * The SFTP tab's own body: a local column and a remote column, and the
 * transfers moving files between them.
 *
 * Kept mounted while its tab exists and hidden with `visibility` rather than
 * unmounted on every tab switch, the same reasoning ADR-0014 gives for a
 * terminal: coming back to a directory five levels deep should not mean
 * climbing back down it.
 */
export function SftpBrowser({
  sessionId,
  handle,
  visible,
  frame,
  id,
  labelledBy,
  onRemoteChange,
}: SftpBrowserProps): JSX.Element {
  const i18n = useTranslator();
  const browser = useSftpBrowser(handle);

  useEffect(() => {
    onRemoteChange(sessionId, {
      remotePath: browser.remotePath,
      remoteEntries: browser.remoteEntries,
      treeChain: browser.treeChain,
      treeChildren: browser.treeChildren,
      enterRemote: browser.enterRemote,
    });
    return () => onRemoteChange(sessionId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionId,
    browser.remotePath,
    browser.remoteEntries,
    browser.treeChain,
    browser.treeChildren,
    browser.enterRemote,
  ]);

  const openLocal = (entry: LocalEntry): void => {
    if (entry.isDir) browser.enterLocal(entry.path);
  };
  const openRemote = (entry: SftpEntry): void => {
    if (entry.isDir) browser.enterRemote(entry.remotePath);
  };

  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      style={{ ...frame, visibility: visible ? 'visible' : 'hidden' }}
      className="bg-surface-terminal absolute flex flex-col overflow-hidden"
    >
      <div className="border-line-subtle bg-surface-chrome flex h-8 shrink-0 items-center gap-6 border-b px-3.5">
        <span className="text-ink-faint text-[10px] font-bold tracking-[0.1em]">
          {i18n.t('sftp.local')}
        </span>
        <span className="text-ink-muted truncate font-mono text-[11.5px]">
          {browser.localPath ?? ''}
        </span>
        <div className="flex-1" />
        <span className="text-ink-faint text-[10px] font-bold tracking-[0.1em]">
          {i18n.t('sftp.remote')}
        </span>
        <span className="text-ink-muted truncate font-mono text-[11.5px]">{browser.remotePath}</span>
        <button
          type="button"
          onClick={browser.uploadFromDialog}
          className="bg-accent text-surface-base rounded px-2.5 py-1 text-[11px] font-semibold"
        >
          {i18n.t('sftp.upload')}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="border-line-subtle overflow-y-auto border-r py-1.5">
          <Header i18n={i18n} />
          {browser.localError !== null && (
            <p className="text-danger-text px-2.5 py-2 text-[12px]">
              {i18n.t(describeSftpFailure(browser.localError))}
            </p>
          )}
          {browser.localError === null && browser.localParent !== null && (
            <Row
              name=".."
              isDir
              size={0}
              modifiedUnixSecs={null}
              onOpen={browser.goUpLocal}
              onTransfer={null}
              transferLabel=""
            />
          )}
          {browser.localError === null && !browser.localLoading && browser.localEntries.length === 0 && (
            <p className="text-ink-faint px-2.5 py-2 text-[12px]">{i18n.t('sftp.empty')}</p>
          )}
          {browser.localError === null &&
            browser.localEntries.map((entry) => (
              <Row
                key={entry.path}
                name={entry.name}
                isDir={entry.isDir}
                size={entry.size}
                modifiedUnixSecs={entry.modifiedUnixSecs}
                onOpen={() => openLocal(entry)}
                onTransfer={entry.isDir ? null : () => browser.upload(entry)}
                transferLabel={i18n.t('sftp.upload')}
              />
            ))}
        </div>

        <div className="overflow-y-auto py-1.5">
          <Header i18n={i18n} />
          {browser.remoteError !== null && (
            <p className="text-danger-text px-2.5 py-2 text-[12px]">
              {i18n.t(describeSftpFailure(browser.remoteError))}
            </p>
          )}
          {browser.remoteError === null && browser.remoteParent !== null && (
            <Row
              name=".."
              isDir
              size={0}
              modifiedUnixSecs={null}
              onOpen={browser.goUpRemote}
              onTransfer={null}
              transferLabel=""
            />
          )}
          {browser.remoteError === null &&
            !browser.remoteLoading &&
            browser.remoteEntries.length === 0 && (
              <p className="text-ink-faint px-2.5 py-2 text-[12px]">{i18n.t('sftp.empty')}</p>
            )}
          {browser.remoteError === null &&
            browser.remoteEntries.map((entry) => (
              <Row
                key={entry.remotePath}
                name={entry.name}
                isDir={entry.isDir}
                size={entry.size}
                modifiedUnixSecs={entry.modifiedUnixSecs}
                onOpen={() => openRemote(entry)}
                onTransfer={entry.isDir ? null : () => browser.download(entry)}
                transferLabel={i18n.t('sftp.download')}
              />
            ))}
        </div>
      </div>

      {(browser.transfers.length > 0 || hasActiveTransfer(browser.transfers)) && (
        <div className="border-line-subtle bg-surface-panel flex max-h-[120px] shrink-0 flex-col gap-1 overflow-y-auto border-t py-2">
          <div className="flex items-center gap-2 px-3.5">
            <span className="text-ink-faint text-[10px] font-bold tracking-[0.1em]">
              {i18n.t('sftp.transfers')}
            </span>
            <span className="bg-surface-raised text-ink-faint rounded px-1.5 py-0.5 font-mono text-[9.5px]">
              {browser.transfers.length}
            </span>
          </div>
          {browser.transfers.map((entry) => (
            <TransferRow
              key={entry.transfer}
              entry={entry}
              i18n={i18n}
              onCancel={() => browser.cancelTransfer(entry.transfer)}
              onDismiss={() => browser.dismissTransfer(entry.transfer)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
