import type { JSX } from 'react';

import { jumpRole } from '../features/sessions';
import { groupSessions } from '../features/sessions/state';
import type { LiveSession } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

import { JumpMark } from './JumpMark';
import { SessionMarker } from './SessionMarker';

interface SessionsSidebarProps {
  readonly sessions: readonly LiveSession[];
  readonly selectedId: string | null;
  /** Which hosts a keystroke reaches, or `null` when it reaches one. */
  readonly receiving: ReadonlySet<string> | null;
  /** Connected hosts a keystroke does not reach. Empty unless something is armed. */
  readonly spared: ReadonlySet<string>;
  /** Which host is being dragged towards a rectangle, or `null` when none is. */
  readonly onDrag: (sessionId: string | null) => void;
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
  receiving,
  spared,
  onDrag,
  onSelect,
  onAdd,
  onMenu,
}: SessionsSidebarProps): JSX.Element {
  const i18n = useTranslator();
  /* Both marks are relations between two saved hosts, so the whole list is
     what decides them: a host is a jump host because something else names it,
     which is not a fact its own row carries. */
  const saved = sessions.map((live) => live.session);
  const groups = groupSessions(sessions);

  return (
    <nav
      aria-label={i18n.t('sessions.title')}
      className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
    >
      <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <span className="text-ink-faint shrink-0 text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('sessions.title')}
        </span>

        <span className="min-w-0 flex-1" />

        {/* How many hosts are on the receiving end, at the top of the list of
            hosts. The status bar carries the same count; this one is beside
            the rows that say which. */}
        {receiving !== null && (
          <span className="text-warn bg-warn-soft border-warn/60 shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.1em]">
            {i18n.t('sessions.receiving', { count: String(receiving.size) })}
          </span>
        )}

        <button
          type="button"
          onClick={onAdd}
          aria-label={i18n.t('sessions.add')}
          title={i18n.t('sessions.add')}
          className="text-ink-muted hover:text-ink shrink-0"
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
                  const reached = receiving?.has(session.id) === true;
                  const held = spared.has(session.id);

                  /* The receiving edge outranks the selection edge. Both are
                     2px down the leading edge and only one can be drawn, and
                     which host is about to run your command matters more than
                     which one you last clicked. */
                  const edge = reached
                    ? 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-warn)]'
                    : selected
                      ? 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-accent)]'
                      : 'hover:bg-surface-raised/50';

                  return (
                    <li
                      key={session.id}
                      /* Dragging a host straight into a rectangle. It is the
                         same gesture as dragging a tab and it means something
                         different: this one may not be open at all, so the
                         shell connects rather than moves. The row keeps its
                         click, which opens the host wherever the focus is.

                         A payload is set because some engines will not begin a
                         drag without one, and nothing reads it: what is being
                         dragged is held in the shell, so nothing dragged in
                         from outside the window can pose as a host. */
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copyMove';
                        event.dataTransfer.setData('text/plain', session.name);
                        onDrag(session.id);
                      }}
                      onDragEnd={() => onDrag(null)}
                      className={`group relative flex items-center rounded ${edge}`}
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
                        <JumpMark role={jumpRole(session, saved)} />
                        <span className="truncate text-[12.5px]">{session.name}</span>

                        {reached && (
                          <svg
                            viewBox="0 0 24 24"
                            className="text-warn ml-auto h-3.5 w-3.5 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            role="img"
                            aria-label={i18n.t('terminal.group.sync.on')}
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}

                        {/* A word rather than a crossed-out tick. This is the
                            list's answer to "which connected host am I not
                            about to hit", and a negative marker read at a
                            glance is one somebody will read as the positive. */}
                        {held && (
                          <span className="text-ink-faint ml-auto shrink-0 text-[9px] font-bold tracking-[0.08em]">
                            {i18n.t('sessions.spared')}
                          </span>
                        )}

                        {!reached && !held && (
                          <span className="text-ink-faint ml-auto shrink-0 font-mono text-[10.5px]">
                            {session.host}
                          </span>
                        )}
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
