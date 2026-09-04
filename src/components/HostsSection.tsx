import { useState } from 'react';
import type { JSX, ReactNode } from 'react';

import {
  filterHosts,
  hostGroupLabel,
  hostRows,
  hostSections,
  hostSubtreeCounts,
  useCollapsedBastions,
  visibleHostRows,
} from '../features/sessions';
import type { HostRow, LiveSession } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { CommandModifier } from '../ipc';

import { EmptyPanel } from './EmptyPanel';
import { HostKindIcon } from './HostKindIcon';

interface HostsSectionProps {
  readonly sessions: readonly LiveSession[];
  /** The host on the form, or `null` when nothing is open here. */
  readonly selectedId: string | null;
  /** Whether the open form is the unsaved "new host" draft. */
  readonly creatingNew: boolean;
  /** Whether the host list is beside the form. The rail's own Home icon
      toggles this, the same as it already does for Sessions and SFTP
      (`ActivityRail.tsx`); Home had no way to hide its own list at all
      until now. */
  readonly sidebarOpen: boolean;
  /** For `EmptyPanel`'s own command-palette hint, unused while `title`/
      `body` are overridden below but part of its uniform signature. */
  readonly modifier: CommandModifier;
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
 *
 * ADR-0052: flush panels at `SessionsSidebar.tsx`'s own density, not the
 * centred, rounded-card pair #237 gave this screen. The filter box below the
 * header is the same template `SessionsSidebar.tsx`'s own search already
 * draws, once a list with no way to narrow it stopped being fine at book
 * scale.
 *
 * ADR-0060: the list itself is organized by topology now, not by the
 * free-text `group` a host happened to be typed into. Bastions (a host
 * carrying at least one other) nest what they carry directly beneath them,
 * `orderChain`'s own placement (`jump.ts`, already proven for
 * `SessionsSidebar.tsx`); everything with no jump relationship at all sits
 * in Direct, flat. `group` moves off the section axis onto a small pill per
 * row instead.
 */
export function HostsSection({
  sessions,
  selectedId,
  creatingNew,
  sidebarOpen,
  modifier,
  onSelect,
  onNew,
  detail,
}: HostsSectionProps): JSX.Element {
  const i18n = useTranslator();
  const [query, setQuery] = useState('');
  const { collapsed, toggle } = useCollapsedBastions();
  const { survivors, forceExpanded } = filterHosts(sessions, query);
  const { bastions, direct } = hostSections(hostRows(survivors));
  const visibleBastions = visibleHostRows(bastions, collapsed, forceExpanded);
  const subtreeCounts = hostSubtreeCounts(bastions);

  return (
    <div className="flex h-full min-h-0">
      {sidebarOpen && (
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
              placeholder={i18n.t('home.hosts.filter')}
              aria-label={i18n.t('home.hosts.filter')}
              autoComplete="off"
              spellCheck={false}
              className="bg-surface-input border-line-subtle text-ink placeholder:text-ink-faint focus:border-line-strong w-full rounded border py-1 pr-2 pl-7 text-[12px] outline-none"
            />
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-ink-secondary text-[12.5px] font-semibold">
              {i18n.t('sessions.empty.title')}
            </p>
            <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
              {i18n.t('sessions.empty.body')}
            </p>
          </div>
        ) : survivors.length === 0 ? (
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
            {/* Bastions before Direct, and hidden entirely rather than drawn
                empty (ADR-0060): the same rule `groupSessions`/`filterGroups`
                already followed for a group with nothing under it. */}
            {visibleBastions.length > 0 && (
              <section className="flex flex-col gap-0.5">
                <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                  <span className="truncate">{i18n.t('home.hosts.bastions')}</span>
                  <span className="text-ink-disabled ml-auto font-mono text-[10px]">{bastions.length}</span>
                </h2>

                <ul className="flex flex-col gap-0.5">
                  {visibleBastions.map((row) => (
                    <HostRowItem
                      key={row.live.session.id}
                      row={row}
                      selected={!creatingNew && row.live.session.id === selectedId}
                      collapsed={
                        row.depth === 0 && row.childrenShown
                          ? collapsed.has(row.live.session.id) && !forceExpanded.has(row.live.session.id)
                          : null
                      }
                      hiddenCount={subtreeCounts.get(row.live.session.id) ?? 0}
                      onToggleCollapse={() => toggle(row.live.session.id)}
                      onSelect={() => onSelect(row.live.session.id)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {direct.length > 0 && (
              <section className="flex flex-col gap-0.5">
                <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                  <span className="truncate">{i18n.t('home.hosts.direct')}</span>
                  <span className="text-ink-disabled ml-auto font-mono text-[10px]">{direct.length}</span>
                </h2>

                <ul className="flex flex-col gap-0.5">
                  {direct.map((row) => (
                    <HostRowItem
                      key={row.live.session.id}
                      row={row}
                      selected={!creatingNew && row.live.session.id === selectedId}
                      collapsed={null}
                      hiddenCount={0}
                      onToggleCollapse={() => undefined}
                      onSelect={() => onSelect(row.live.session.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </nav>
      )}

      <div className="min-w-0 flex-1 overflow-y-auto">
        {selectedId === null && !creatingNew ? (
          <EmptyPanel
            modifier={modifier}
            title={i18n.t('home.hosts.empty.title')}
            body={i18n.t('home.hosts.empty.body')}
          />
        ) : (
          detail
        )}
      </div>
    </div>
  );
}

interface HostRowItemProps {
  readonly row: HostRow;
  readonly selected: boolean;
  /** `null` for a row that is not a bastion root, so no disclosure draws at
      all: reserving its width for every row would misalign nothing here,
      since a bastion and a plain host are already in different sections. */
  readonly collapsed: boolean | null;
  /** What a collapsed bastion is standing in for, `0` otherwise. */
  readonly hiddenCount: number;
  readonly onToggleCollapse: () => void;
  readonly onSelect: () => void;
}

/**
 * One row of the book, nested by `depth` (ADR-0060) the same way
 * `SessionsSidebar.tsx` already nests a rider beneath its bastion: a faint
 * rule per level, not a second indentation system invented for this list.
 * `group`, no longer a section heading here, rides as a small pill instead.
 */
function HostRowItem({
  row,
  selected,
  collapsed,
  hiddenCount,
  onToggleCollapse,
  onSelect,
}: HostRowItemProps): JSX.Element {
  const i18n = useTranslator();
  const { session } = row.live;
  const group = hostGroupLabel(session);
  const subtitle =
    collapsed === true
      ? i18n.t(i18n.plural(hiddenCount) === 'one' ? 'home.hosts.bastions.collapsed.one' : 'home.hosts.bastions.collapsed.other', {
          count: String(hiddenCount),
        })
      : session.host;

  return (
    <li className="flex items-center">
      {Array.from({ length: row.depth }, (_, level) => (
        <span key={level} aria-hidden="true" className="flex w-3 shrink-0 items-center justify-center self-stretch">
          <span className="bg-ink-faint/25 h-full w-px" />
        </span>
      ))}

      {collapsed !== null && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={i18n.t(
            collapsed ? 'home.hosts.bastions.expand' : 'home.hosts.bastions.collapse',
            { name: session.name },
          )}
          className="text-ink-faint hover:text-ink-muted flex h-4 w-4 shrink-0 items-center justify-center"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-2.5 w-2.5 ${collapsed ? '' : 'rotate-90'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full min-w-0 flex-col gap-0.5 rounded px-2 py-1 text-left ${
          selected
            ? 'bg-surface-raised text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
            : 'text-ink-secondary hover:bg-surface-raised/50'
        }`}
      >
        {/* Name and address on their own lines, `HostKindIcon` (ADR-0031)
            ahead of the name: the same template `SessionsSidebar.tsx`
            already closed, reused rather than a second, plainer row
            invented for this list. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <HostKindIcon kind={session.kind} className="text-ink-faint h-3 w-3 shrink-0" />
          <span className="truncate text-[12.5px]">{session.name}</span>
          {group !== null && (
            <span className="text-ink-muted bg-surface-raised ml-auto shrink-0 rounded px-1.5 py-px text-[9px]">
              {group}
            </span>
          )}
        </span>
        <span className="text-ink-faint truncate pl-[18px] font-mono text-[10.5px]">{subtitle}</span>
      </button>
    </li>
  );
}
