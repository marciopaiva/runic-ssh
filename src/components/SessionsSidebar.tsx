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
 */
export function SessionsSidebar({
  sessions,
  selectedId,
  onSelect,
  onAdd,
  onMenu,
}: SessionsSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const groups = groupSessions(sessions);

  return (
    <nav
      aria-label={i18n.t('sessions.title')}
      className="bg-surface-panel border-line-subtle flex h-full w-[264px] shrink-0 flex-col border-r"
    >
      <header className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
        <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('sessions.title')}
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={i18n.t('sessions.add')}
          title={i18n.t('sessions.add')}
          className="text-ink-muted hover:text-ink"
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
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {groups.map((group) => (
            <section key={group.name ?? 'ungrouped'} className="flex flex-col gap-0.5">
              <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                <span className="truncate">{group.name ?? i18n.t('sessions.ungrouped')}</span>
                <span className="text-ink-disabled ml-auto font-mono text-[10px]">
                  {group.sessions.length}
                </span>
              </h2>

              <ul className="flex flex-col gap-0.5">
                {group.sessions.map(({ session, kind }) => {
                  const selected = session.id === selectedId;

                  return (
                    <li
                      key={session.id}
                      className={`group relative flex items-center rounded ${
                        selected
                          ? 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-accent)]'
                          : 'hover:bg-surface-raised/50'
                      }`}
                      /* Right-click is the convention. The button beside it is
                         what somebody finds without knowing the convention. */
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onMenu(session.id, { x: event.clientX, y: event.clientY });
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(session.id)}
                        aria-current={selected ? 'true' : undefined}
                        className={`flex h-7 min-w-0 flex-1 items-center gap-2.5 px-2 text-left ${
                          selected ? 'text-ink' : 'text-ink-secondary'
                        }`}
                      >
                        <SessionMarker kind={kind} />
                        <span className="truncate text-[12.5px]">{session.name}</span>
                        <span className="text-ink-faint ml-auto shrink-0 font-mono text-[10.5px]">
                          {session.host}
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
                        /* Hidden until the row is hovered or the button is
                           focused, so the list stays quiet — but never hidden
                           from the keyboard, which is how a hover-only
                           affordance becomes unreachable. */
                        className="text-ink-faint hover:text-ink mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
            </section>
          ))}
        </div>
      )}
    </nav>
  );
}
