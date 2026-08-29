import type { JSX, ReactNode } from 'react';

import { groupSessions } from '../features/sessions/state';
import type { LiveSession } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

interface HostsSectionProps {
  readonly sessions: readonly LiveSession[];
  /** The host on the form, or `null` when nothing is open here. */
  readonly selectedId: string | null;
  /** Whether the open form is the unsaved "new host" draft. */
  readonly creatingNew: boolean;
  readonly onSelect: (sessionId: string) => void;
  readonly onNew: () => void;
  /** The form itself, assembled by the caller: its wiring is `App.tsx`'s, not
   * this component's, the way `SessionsSidebar` never assembled a terminal. */
  readonly detail: ReactNode;
}

/**
 * Create, read, update, delete for a saved host, moved out of the Sessions
 * sidebar (ADR-0029, and the maintainer's own follow-up to it): that list
 * only ever connects now. This is a list beside a form, one host at a time,
 * chosen over a tab per open host because a CRUD screen is exactly that
 * shape, and a form nobody is actively typing into does not need its own tab
 * to be found again. Clicking the row it belongs to does the same thing. The
 * draft survives switching rows regardless: `editors` in `App.tsx` keeps
 * every unsaved form, whether or not this list is showing it.
 */
export function HostsSection({
  sessions,
  selectedId,
  creatingNew,
  onSelect,
  onNew,
  detail,
}: HostsSectionProps): JSX.Element {
  const i18n = useTranslator();
  const groups = groupSessions(sessions);

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label={i18n.t('home.hosts')}
        className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
      >
        <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
          <span className="text-ink-faint shrink-0 text-[10.5px] font-bold tracking-[0.1em]">
            {i18n.t('home.hosts')}
          </span>

          <span className="min-w-0 flex-1" />

          <button
            type="button"
            onClick={onNew}
            aria-label={i18n.t('sessions.add')}
            title={i18n.t('sessions.add')}
            aria-pressed={creatingNew}
            className={creatingNew ? 'text-accent shrink-0' : 'text-ink-muted hover:text-ink shrink-0'}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                  {group.sessions.map(({ session }) => {
                    const selected = !creatingNew && session.id === selectedId;

                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(session.id)}
                          aria-current={selected ? 'true' : undefined}
                          className={`flex h-7 w-full min-w-0 items-center gap-2.5 rounded px-2 text-left ${
                            selected
                              ? 'bg-surface-raised text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                              : 'text-ink-secondary hover:bg-surface-raised/50'
                          }`}
                        >
                          <span className="truncate text-[12.5px]">{session.name}</span>
                          <span className="text-ink-faint ml-auto shrink-0 font-mono text-[10.5px]">
                            {session.host}
                          </span>
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

      <div className="min-w-0 flex-1 overflow-y-auto">
        {selectedId === null && !creatingNew ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-ink-secondary text-[12.5px] font-semibold">
              {i18n.t('home.hosts.empty.title')}
            </p>
            <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
              {i18n.t('home.hosts.empty.body')}
            </p>
          </div>
        ) : (
          detail
        )}
      </div>
    </div>
  );
}
