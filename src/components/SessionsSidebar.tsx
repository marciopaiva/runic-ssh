import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { groupSessions } from '../features/sessions/state';
import type { LiveSession } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

import { SessionMarker } from './SessionMarker';

interface SessionsSidebarProps {
  readonly sessions: readonly LiveSession[];
  readonly selectedId: string | null;
  readonly onSelect: (sessionId: string) => void;
  readonly onAdd: () => void;
  /** Opens the row's menu at a point on screen. */
  readonly onMenu: (sessionId: string, at: { readonly x: number; readonly y: number }) => void;
}

/**
 * The list of saved hosts.
 *
 * Presentational: it renders what it is handed and reports what was clicked.
 * Loading, grouping and connection state live in the feature slice.
 *
 * Layout follows the denser mockup direction: a filter at the top, collapsible
 * groups, and two-line rows (name over user@host) so a long list stays
 * scannable without inventing fields the session record does not carry.
 */
export function SessionsSidebar({
  sessions,
  selectedId,
  onSelect,
  onAdd,
  onMenu,
}: SessionsSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const query = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (query === '') return sessions;
    return sessions.filter(({ session }) => {
      const haystack = [session.name, session.host, session.user, session.group ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [sessions, query]);

  const groups = groupSessions(visible);

  const toggleGroup = (key: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <nav
      aria-label={i18n.t('sessions.title')}
      className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
    >
      <header className="border-line-subtle flex flex-col gap-2.5 border-b px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-ink-faint text-[10px] font-bold tracking-[0.12em]">
            {i18n.t('sessions.title')}
          </span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={i18n.t('sessions.add')}
            title={i18n.t('sessions.add')}
            className="text-ink-muted hover:bg-surface-raised hover:text-accent-bright flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path
                d="M8 3.5v9M3.5 8h9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <label className="relative block">
          <span className="sr-only">{i18n.t('sessions.filter')}</span>
          <svg
            viewBox="0 0 16 16"
            className="text-ink-faint pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={i18n.t('sessions.filter')}
            className="bg-surface-input text-ink border-line-subtle placeholder:text-ink-faint h-8 w-full rounded-md border py-1 pr-2.5 pl-8 text-[12px] outline-none focus:border-accent"
          />
        </label>
      </header>

      {sessions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-ink-secondary text-[12.5px] font-semibold">
            {i18n.t('sessions.empty.title')}
          </p>
          <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
            {i18n.t('sessions.empty.body')}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-ink-faint flex flex-1 items-center justify-center px-6 text-center text-[12px]">
          {i18n.t('palette.empty', { query: filter.trim() })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
          {groups.map((group) => {
            const key = group.name ?? '__ungrouped__';
            const isCollapsed = collapsed.has(key);

            return (
              <section key={key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="text-ink-muted hover:text-ink flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] font-bold tracking-[0.1em]"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className={`h-2.5 w-2.5 shrink-0 transition-transform ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 4.5 6 7.5 9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="truncate">{group.name ?? i18n.t('sessions.ungrouped')}</span>
                  <span className="text-ink-disabled bg-surface-raised ml-auto rounded px-1.5 py-0.5 font-mono text-[9.5px]">
                    {group.sessions.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <ul className="flex flex-col gap-0.5">
                    {group.sessions.map(({ session, kind }) => {
                      const selected = session.id === selectedId;
                      const where = `${session.user}@${session.host}`;

                      return (
                        <li
                          key={session.id}
                          className={`group relative flex items-stretch rounded-lg ${
                            selected
                              ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]'
                              : 'hover:bg-surface-raised/70'
                          }`}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            onMenu(session.id, { x: event.clientX, y: event.clientY });
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(session.id)}
                            aria-current={selected ? 'true' : undefined}
                            className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left"
                          >
                            <span className="mt-1 shrink-0">
                              <SessionMarker kind={kind} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span
                                className={`truncate text-[12.5px] font-semibold ${
                                  selected ? 'text-ink' : 'text-ink-secondary'
                                }`}
                              >
                                {session.name}
                              </span>
                              <span className="text-ink-faint truncate font-mono text-[10.5px]">
                                {where}
                              </span>
                            </span>
                          </button>

                          <button
                            type="button"
                            aria-label={i18n.t('sessions.actions', { name: session.name })}
                            title={i18n.t('sessions.actions', { name: session.name })}
                            onClick={(event) => {
                              const box = event.currentTarget.getBoundingClientRect();
                              onMenu(session.id, { x: box.right - 4, y: box.bottom + 2 });
                            }}
                            className="text-ink-faint hover:text-ink mr-1 flex h-auto w-6 shrink-0 items-center justify-center self-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                              <circle cx="8" cy="3.5" r="1.2" fill="currentColor" />
                              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                              <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </nav>
  );
}
