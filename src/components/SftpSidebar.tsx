import type { JSX } from 'react';

import { groupLabel } from '../features/terminal';
import type { LiveSession } from '../features/sessions/state';
import type { SftpRemoteView } from '../features/sftp/use-browser';
import { treeRows } from '../features/sftp/browser';
import { useTranslator } from '../features/settings';

import { FileIcon, FolderIcon } from './SftpBrowser';
import { SessionMarker } from './SessionMarker';

interface SftpSidebarProps {
  readonly session: LiveSession;
  /** `null` for the one render between opening the tab and the pane's own
   * `useSftpBrowser` reporting its first state up. */
  readonly remote: SftpRemoteView | null;
  /** Stops browsing this session and returns to the workspace's own host
   * picker (ADR-0044). */
  readonly onClose: () => void;
}

/**
 * The left sidebar's other face: `design/canvas/gen.py`'s `build_sftp()`
 * replaces the whole `SessionsSidebar` with this, a remote directory tree,
 * whenever an SFTP tab is focused (`App.tsx`'s sidebar mount site).
 *
 * Presentational, like `SessionsSidebar`: the tree's own shape comes from
 * `treeRows`, and a click is nothing more than the same `enterRemote` the
 * pane's own rows already call, so the two never disagree about where the
 * remote side is.
 */
export function SftpSidebar({ session, remote, onClose }: SftpSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const rows =
    remote === null ? [] : treeRows(remote.treeChain, remote.treeChildren, remote.remoteEntries);

  return (
    <nav
      aria-label={i18n.t('sftp.remote')}
      className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
    >
      <div className="border-line-subtle flex flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-faint text-[10px] font-bold tracking-[0.12em]">
            {i18n.t('sftp.remote')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.t('sftp.workspace.stopBrowsing')}
            title={i18n.t('sftp.workspace.stopBrowsing')}
            className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded"
          >
            <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <SessionMarker kind={session.kind} />
          <span className="text-ink2 truncate font-mono text-[11.5px]">
            {groupLabel(session.session).where}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rows.map((row) => (
          <button
            key={row.path}
            type="button"
            onClick={() => remote?.enterRemote(row.path)}
            disabled={remote === null || !row.isDir}
            style={{ paddingLeft: `${String(8 + row.depth * 14)}px` }}
            className={`flex w-full items-center gap-1.5 rounded py-[5px] pr-2 text-left disabled:cursor-default ${
              row.current ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
            }`}
          >
            {row.expandable ? (
              <svg
                viewBox="0 0 24 24"
                className={`text-ink-faint h-[11px] w-[11px] shrink-0 ${row.expanded ? 'rotate-90' : ''}`}
                fill="none"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="h-[11px] w-[11px] shrink-0" />
            )}
            {row.isDir ? (
              <FolderIcon
                className={`h-[13px] w-[13px] shrink-0 ${row.current ? 'text-accent' : 'text-ink-faint'}`}
              />
            ) : (
              <FileIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
            )}
            <span
              className={`truncate font-mono text-[11.5px] ${row.current ? 'text-ink' : 'text-ink-muted'}`}
            >
              {row.name}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
