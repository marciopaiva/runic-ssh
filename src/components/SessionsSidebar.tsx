import { useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { bastionName, jumpRole, orderChain } from '../features/sessions';
import { describeState, filterGroups, groupKey, groupSessions, soloGroup } from '../features/sessions/state';
import type { LiveSession } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

import { HostKindIcon } from './HostKindIcon';
import { SessionMarker } from './SessionMarker';

function FolderMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="text-accent h-[13px] w-[13px] shrink-0" fill="none" aria-hidden="true">
      <path d="M4 6.5h6l1.6 2H20v9.5H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

interface SessionsSidebarProps {
  readonly title: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly sessions: readonly LiveSession[];
  /** Sessions mode only: the tab currently focused. */
  readonly selectedId?: string | null;
  /** Sessions mode only: which hosts a keystroke reaches, or `null` when it
   * reaches one. */
  readonly receiving?: ReadonlySet<string> | null;
  /** Sessions mode only: connected hosts a keystroke does not reach. */
  readonly spared?: ReadonlySet<string>;
  /** SFTP mode only: hosts currently sitting in the source pane or a
   * destination slot (ADR-0046). Several may be marked at once, since
   * ADR-0045 dropped the one-tab-at-a-time model this used to draw against. */
  readonly assigned?: ReadonlySet<string>;
  /** Content specific to one workspace's meaning of a row, drawn above the
   * search box. SFTP's `localhost` pick lives here: it needs no saved host
   * and answers to neither `onDrag` nor `onSelect` below, which both name a
   * saved session by id. */
  readonly leading?: ReactNode;
  /** Which host is being dragged towards a rectangle, or `null` when none is. */
  readonly onDrag: (sessionId: string | null) => void;
  readonly onSelect: (sessionId: string) => void;
  /** Opens the row's menu at a point on screen. Sessions mode only: SFTP has
   * nothing to connect or disconnect from a row's own menu, since a row
   * there is a pick for a pane rather than a tab. */
  readonly onMenu?: (sessionId: string, at: { readonly x: number; readonly y: number }) => void;
}

/**
 * The list of saved hosts.
 *
 * Presentational: it renders what it is handed and reports what was clicked.
 * Loading, grouping and connection state live in the feature slice.
 *
 * Shared between Sessions and SFTP since ADR-0046: `SftpWorkspaceSidebar`'s
 * own reasoning for a plainer list ("a host picked to browse does not need a
 * kind icon or a jump mark") was overridden directly, in favour of one
 * sidebar rather than two that have to be kept looking alike by hand. What
 * changes between the two callers is never the row's own shape, only what a
 * row *means*: `selectedId`/`receiving`/`spared` for Sessions' "which tab is
 * this and does it receive," `assigned` for SFTP's "is this open in a pane
 * right now."
 */
export function SessionsSidebar({
  title,
  emptyTitle,
  emptyBody,
  sessions,
  selectedId = null,
  receiving = null,
  spared,
  assigned,
  leading,
  onDrag,
  onSelect,
  onMenu,
}: SessionsSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const [query, setQuery] = useState('');
  /** The one group asked to be shown alone, by `groupKey`, or `null`. */
  const [solo, setSolo] = useState<string | null>(null);
  const sparedSet = spared ?? new Set<string>();
  /* Both marks are relations between two saved hosts, so the whole list is
     what decides them: a host is a jump host because something else names it,
     which is not a fact its own row carries. */
  const saved = sessions.map((live) => live.session);
  /* Unfiltered, so soloing a group and then searching something that group
     does not currently have still leaves its name on the chip below: the way
     back to every group stays visible even while the search shows nothing. */
  const allGroups = groupSessions(sessions);
  const groups = filterGroups(soloGroup(allGroups, solo), query);
  const soloName =
    solo === null
      ? null
      : (allGroups.find((group) => groupKey(group) === solo)?.name ?? i18n.t('sessions.ungrouped'));

  return (
    <nav
      aria-label={title}
      className="bg-surface-panel border-line-subtle flex h-full w-[280px] shrink-0 flex-col border-r"
    >
      <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <span className="text-ink-faint shrink-0 text-[10.5px] font-bold tracking-[0.1em]">
          {title}
        </span>

        <span className="min-w-0 flex-1" />

        {/* The way back from soloing a group, next to the search: clicking
            the same heading again does the same thing, but a hundred saved
            hosts is exactly the scale where "click the thing you already
            scrolled past" stops being a reasonable way to ask someone to
            undo something. */}
        {soloName !== null && (
          <button
            type="button"
            onClick={() => setSolo(null)}
            aria-label={i18n.t('sessions.solo.clear')}
            title={i18n.t('sessions.solo.clear')}
            className="text-accent bg-accent/10 hover:bg-accent/20 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.05em]"
          >
            <span className="max-w-[80px] truncate">{soloName}</span>
            <svg viewBox="0 0 10 10" className="h-2 w-2 shrink-0" fill="none" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}

        {/* How many hosts are on the receiving end, at the top of the list of
            hosts. The status bar carries the same count; this one is beside
            the rows that say which. */}
        {receiving !== null && (
          <span className="text-warn bg-warn-soft border-warn/60 shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.1em]">
            {i18n.t('sessions.receiving', { count: String(receiving.size) })}
          </span>
        )}
      </header>

      {leading}

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
          <p className="text-ink-secondary text-[12.5px] font-semibold">{emptyTitle}</p>
          <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">{emptyBody}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-ink-secondary text-[12.5px] font-semibold">
            {i18n.t('sessions.filter.empty.title')}
          </p>
          <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
            {i18n.t('sessions.filter.empty.body')}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {groups.map((group) => {
            const byId = new Map(group.sessions.map((live) => [live.session.id, live]));
            /* Places a host directly beneath the bastion it rides, in this
               same group, instead of marking the relation with a glyph
               (`jump.ts`). A host whose bastion is filed under a different
               heading has nothing to nest under here; `JumpMark` still
               fires for exactly that case, below. */
            const chain = orderChain(group.sessions.map((live) => live.session));

            const key = groupKey(group);
            const displayName = group.name ?? i18n.t('sessions.ungrouped');

            return (
              <section key={key} className="flex flex-col gap-0.5">
                <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                  {/* Click to see this group alone, click again (or the chip
                      in the header) to bring the rest back. Only worth
                      reaching for once there is enough to want it hidden, but
                      nothing here needs to know how many groups exist to
                      offer it: it does nothing extra with just one. */}
                  <button
                    type="button"
                    onClick={() => setSolo((current) => (current === key ? null : key))}
                    aria-pressed={solo === key}
                    title={i18n.t('sessions.solo', { name: displayName })}
                    className="hover:text-ink flex min-w-0 flex-1 items-center text-left"
                  >
                    <span className="truncate">{displayName}</span>
                  </button>
                  <span className="text-ink-disabled ml-auto font-mono text-[10px]">
                    {group.sessions.length}
                  </span>
                </h2>

                <ul className="flex flex-col gap-0.5">
                  {chain.map((row) => {
                    const live = byId.get(row.id);
                    if (live === undefined) return null;
                    const { session, kind } = live;
                    const role = jumpRole(session, saved);
                    /* A rider not nested here has nothing for position to
                       say, but riding is always exactly one bastion, so it is
                       always namable (`carries` is not: a bastion can carry
                       more than one, and there is no one name for that). Named
                       when it can be, replacing the address in the trailing
                       slot. */
                    const bastion = role.rides && row.depth === 0 ? bastionName(session, saved) : null;
                    /* Suppressed exactly where the tree already says it: a
                       rider nested under its bastion, or a bastion whose
                       riders are the rows right beneath it. `sr-only` text
                       keeps the same fact reachable for a screen reader,
                       which reads row order rather than indentation, for the
                       nested case; the named case is already readable text
                       and needs no `sr-only` twin. */
                    const carriesShown = role.carries && !row.childrenShown;
                    const selected = session.id === selectedId;
                    const reached = receiving?.has(session.id) === true;
                    const held = sparedSet.has(session.id);
                    const isAssigned = assigned?.has(session.id) === true;

                    /* The receiving edge outranks the selection edge. Both are
                       2px down the leading edge and only one can be drawn, and
                       which host is about to run your command matters more
                       than which one you last clicked. */
                    const edge = reached
                      ? 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-warn)]'
                      : selected
                        ? 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-accent)]'
                        : 'hover:bg-surface-raised/50';

                    return (
                      <li
                        key={session.id}
                        /* Dragging a host straight into a rectangle. It is the
                           same gesture as dragging a tab and it means
                           something different: this one may not be open at
                           all, so the shell connects rather than moves. The
                           row keeps its click, which opens the host wherever
                           the focus is.

                           A payload is set because some engines will not
                           begin a drag without one, and nothing reads it:
                           what is being dragged is held in the shell, so
                           nothing dragged in from outside the window can pose
                           as a host. */
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copyMove';
                          event.dataTransfer.setData('text/plain', session.name);
                          onDrag(session.id);
                        }}
                        onDragEnd={() => onDrag(null)}
                        className={`group relative flex items-center rounded ${edge}`}
                        /* Right-click is the convention. The button beside it
                           is what somebody finds without knowing the
                           convention. */
                        onContextMenu={
                          onMenu === undefined
                            ? undefined
                            : (event) => {
                                event.preventDefault();
                                onMenu(session.id, { x: event.clientX, y: event.clientY });
                              }
                        }
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(session.id)}
                          aria-current={selected ? 'true' : undefined}
                          className={`flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left ${
                            selected ? 'text-ink' : 'text-ink-secondary'
                          }`}
                        >
                          {/* The chain drawn as position rather than as a
                              glyph (`jump.ts`'s `orderChain`): one faint rule
                              per bastion this row sits under, in place of the
                              mark `JumpMark` used to carry on every rider. */}
                          {Array.from({ length: row.depth }, (_, level) => (
                            <span
                              key={level}
                              aria-hidden="true"
                              className="flex w-3 shrink-0 items-center justify-center self-stretch"
                            >
                              <span className="bg-ink-faint/25 h-full w-px" />
                            </span>
                          ))}

                          <SessionMarker kind={kind} />

                          {/* Name and address on their own lines: a long name
                              (a target riding a bastion, say) and a long
                              address used to shrink each other to an
                              ellipsis on the same row, worse still once a
                              kind icon also asked for room on it. Stacking
                              gives each the row's full width. */}
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {/* What the host is, ADR-0031, beside the state
                                  dot rather than instead of it: the two
                                  answer different questions and neither can
                                  stand in for the other, which is why this
                                  carries its own tone from `kind` rather than
                                  the dot's. Drawn for every host now: `kind`
                                  has no "nobody has said yet" value left to
                                  stay unmarked for. */}
                              <HostKindIcon
                                kind={session.kind}
                                className={`${describeState(kind).tone} h-3 w-3 shrink-0`}
                              />
                              {/* The nested case only: position already drew
                                  it, so a screen reader (which reads row
                                  order, not indentation) still needs the fact
                                  in words. The named case below is already
                                  readable text and needs no `sr-only` twin. */}
                              {role.rides && row.depth > 0 && (
                                <span className="sr-only">{i18n.t('sessions.jump.rides')}</span>
                              )}
                              {role.carries && !carriesShown && (
                                <span className="sr-only">{i18n.t('sessions.jump.carries')}</span>
                              )}
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

                              {/* A word rather than a crossed-out tick. This
                                  is the list's answer to "which connected
                                  host am I not about to hit", and a negative
                                  marker read at a glance is one somebody will
                                  read as the positive. */}
                              {held && (
                                <span className="text-ink-faint ml-auto shrink-0 text-[9px] font-bold tracking-[0.08em]">
                                  {i18n.t('sessions.spared')}
                                </span>
                              )}
                            </div>

                            {/* Its own line now, so it no longer has to
                                choose between showing and giving way to
                                `reached`/`held` above: those answer what the
                                row is doing right now, this answers where it
                                is, and a row can say both at once. Which
                                bastion outranks the address still holds: a
                                host behind one is reached through it, not at
                                it, so the address alone would name a hop
                                nobody dials. Still one tooltip away, via
                                `title`. */}
                            {bastion !== null ? (
                              <span
                                className="text-ink-faint truncate text-[10.5px]"
                                title={i18n.t('sessions.viaBastion', { name: bastion })}
                              >
                                {i18n.t('sessions.viaBastion', { name: bastion })}
                              </span>
                            ) : (
                              <span
                                className="text-ink-faint truncate font-mono text-[10.5px]"
                                title={`${session.user}@${session.host}`}
                              >
                                {session.user}@{session.host}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* SFTP mode's own mark: this host is sitting in a
                            pane right now. Always shown rather than
                            hover-gated, since it names a fact about the row
                            rather than an action on it. */}
                        {isAssigned && (
                          <span className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center">
                            <FolderMark />
                          </span>
                        )}

                        {onMenu !== undefined && (
                          <button
                            type="button"
                            aria-label={i18n.t('sessions.actions', { name: session.name })}
                            title={i18n.t('sessions.actions', { name: session.name })}
                            onClick={(event) => {
                              const box = event.currentTarget.getBoundingClientRect();
                              onMenu(session.id, { x: box.right - 4, y: box.bottom + 2 });
                            }}
                            /* Hidden until the row is hovered or the button is
                               focused, so the list stays quiet. Never hidden
                               from the keyboard, though, which is how a
                               hover-only affordance becomes unreachable. */
                            className="text-ink-faint hover:text-ink mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                              <circle cx="8" cy="3.5" r="1.2" fill="currentColor" />
                              <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                              <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
                            </svg>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </nav>
  );
}
