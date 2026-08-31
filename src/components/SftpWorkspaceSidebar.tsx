import { useState } from 'react';
import type { JSX } from 'react';

import { filterGroups, groupKey, groupSessions } from '../features/sessions/state';
import type { LiveSession } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

import { SessionMarker } from './SessionMarker';

interface SftpWorkspaceSidebarProps {
  readonly sessions: readonly LiveSession[];
  /** Which sessions currently have an SFTP tab open, for the folder mark. */
  readonly sftpTabs: ReadonlySet<string>;
  readonly onOpen: (sessionId: string) => void;
}

/**
 * The SFTP workspace's own host picker (ADR-0044), the sidebar's other
 * state. `SftpSidebar` draws the state after a tab is focused.
 *
 * A plainer `SessionsSidebar`: grouping and search are the same feature
 * slice functions, but the row itself carries none of Sessions' own
 * affordances (drag-to-split, jump-chain marks, the broadcast state) since
 * none of them mean anything to a host picked to browse rather than to type
 * into. A folder mark instead, lit on a session that already has a tab open.
 */
export function SftpWorkspaceSidebar({
  sessions,
  sftpTabs,
  onOpen,
}: SftpWorkspaceSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const [query, setQuery] = useState('');
  const groups = filterGroups(groupSessions(sessions), query);

  return (
    <nav
      aria-label={i18n.t('sftp.workspace.title')}
      className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
    >
      <header className="flex items-center px-3.5 pt-3.5 pb-2.5">
        <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('sftp.workspace.title')}
        </span>
      </header>

      {sessions.length > 0 && (
        <div className="relative px-3.5 pb-2">
          <svg
            viewBox="0 0 24 24"
            className="text-ink-faint pointer-events-none absolute top-1/2 left-6 h-3.5 w-3.5 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="M15 15l4.5 4.5" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={i18n.t('sessions.filter')}
            aria-label={i18n.t('sessions.filter')}
            autoComplete="off"
            spellCheck={false}
            className="bg-surface-input border-line-subtle text-ink placeholder:text-ink-faint focus:border-line-strong w-full rounded border py-1 pr-2 pl-7 text-[12px] outline-none"
          />
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-ink-secondary text-[12.5px] font-semibold">
            {i18n.t('sftp.workspace.empty.title')}
          </p>
          <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
            {i18n.t('sftp.workspace.empty.body')}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {groups.map((group) => (
            <section key={groupKey(group)} className="flex flex-col gap-0.5">
              <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                <span className="truncate">{group.name ?? i18n.t('sessions.ungrouped')}</span>
                <span className="text-ink-disabled ml-auto font-mono text-[10px]">
                  {group.sessions.length}
                </span>
              </h2>

              <ul className="flex flex-col gap-0.5">
                {group.sessions.map((live) => {
                  const open = sftpTabs.has(live.session.id);

                  return (
                    <li key={live.session.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(live.session.id)}
                        className="hover:bg-surface-raised/60 flex w-full items-center gap-2.5 rounded px-2 py-[7px] text-left"
                      >
                        <SessionMarker kind={live.kind} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-ink2 truncate text-[12.5px]">{live.session.name}</span>
                          <span className="text-ink-disabled truncate font-mono text-[10.5px]">
                            {live.session.user}@{live.session.host}
                          </span>
                        </div>
                        {open && (
                          <svg
                            viewBox="0 0 24 24"
                            className="text-accent h-[13px] w-[13px] shrink-0"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M4 6.5h6l1.6 2H20v9.5H4z"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </nav>
  );
}
