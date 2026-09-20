import { useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

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

import { HostKindIcon } from './HostKindIcon';
import { ChevronRightIcon, EditIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from './ui/icons';

interface HostsManagerSidebarProps {
  readonly sessions: readonly LiveSession[];
  /** Puts the host where the workspace beside the button that opened this
      panel is standing, the same placement `hostBookCommands` already
      gives the "+" palette. */
  readonly onUse: (sessionId: string) => void;
  readonly onNew: () => void;
  readonly onEdit: (sessionId: string) => void;
  readonly onDelete: (sessionId: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * The hosts half of ADR-0076's manager sidebar contract, built to the shape
 * `MacrosSidebar.tsx` already follows: a docked panel, list, create and edit
 * through the promoted modal (`HostEditorDialog`, already global since
 * ADR-0072, so no change was needed there), and delete inline with a
 * two-click confirm, no separate dialog.
 *
 * For Sessions, SFTP and Map, the three workspaces whose own host-CRUD
 * story had no delete and no edit-from-a-list before this. Home keeps its
 * own full-screen `HostsSection` (ADR-0029, ADR-0052): the same actions, at
 * the larger scale it already has on purpose, not this panel a second time.
 *
 * The list itself reuses `hostRows`/`hostSections` so the bastion-and-rider
 * nesting ADR-0060 gave the book is not lost here either.
 */
export function HostsManagerSidebar({
  sessions,
  onUse,
  onNew,
  onEdit,
  onDelete,
  onClose,
}: HostsManagerSidebarProps): JSX.Element {
  const i18n = useTranslator();
  const [query, setQuery] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const { collapsed, toggle } = useCollapsedBastions();
  const panel = useRef<HTMLDivElement>(null);

  const { survivors, forceExpanded } = filterHosts(sessions, query);
  const { bastions, direct } = hostSections(hostRows(survivors));
  const visibleBastions = visibleHostRows(bastions, collapsed, forceExpanded);
  const subtreeCounts = hostSubtreeCounts(bastions);

  /* Nothing inside starts focused, and a keydown fired on `document.body`
     never bubbles down into this panel: without moving focus here on mount,
     Escape below has nothing to catch it on (`MacrosSidebar`'s own reason). */
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const remove = (id: string): void => {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    void onDelete(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="bg-surface-panel border-line-subtle flex h-full w-[300px] shrink-0 flex-col border-l outline-none"
      onKeyDown={onKeyDown}
    >
      <div className="border-line-subtle flex items-center justify-between border-b px-3.5 py-3">
        <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
          {i18n.t('hosts.sidebar.title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNew}
            aria-label={i18n.t('sessions.add')}
            title={i18n.t('sessions.add')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={i18n.t('hosts.sidebar.close')}
            title={i18n.t('hosts.sidebar.close')}
            className="text-ink-faint hover:text-ink flex h-6 w-6 items-center justify-center rounded"
          >
            <XIcon className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="relative px-3.5 pt-2.5 pb-1.5">
          <SearchIcon className="text-ink-faint pointer-events-none absolute top-1/2 left-6 h-3.5 w-3.5 -translate-y-1/2" />
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

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-ink-faint p-2 text-[12px]">{i18n.t('sessions.empty.title')}</p>
        ) : survivors.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
            <p className="text-ink-secondary text-[12.5px] font-semibold">
              {i18n.t('sessions.filter.empty.title')}
            </p>
            <p className="text-ink-faint text-[11.5px] leading-snug text-pretty">
              {i18n.t('sessions.filter.empty.body')}
            </p>
          </div>
        ) : (
          <>
            {visibleBastions.length > 0 && (
              <section className="flex flex-col gap-0.5">
                <h2 className="text-ink-muted flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[0.08em]">
                  <span className="truncate">{i18n.t('home.hosts.bastions')}</span>
                  <span className="text-ink-disabled ml-auto font-mono text-[10px]">{bastions.length}</span>
                </h2>
                <ul className="flex flex-col gap-0.5">
                  {visibleBastions.map((row) => (
                    <HostManagerRow
                      key={row.live.session.id}
                      row={row}
                      collapsed={
                        row.depth === 0 && row.childrenShown
                          ? collapsed.has(row.live.session.id) && !forceExpanded.has(row.live.session.id)
                          : null
                      }
                      hiddenCount={subtreeCounts.get(row.live.session.id) ?? 0}
                      confirmingDelete={confirmingDeleteId === row.live.session.id}
                      onToggleCollapse={() => toggle(row.live.session.id)}
                      onUse={() => onUse(row.live.session.id)}
                      onEdit={() => onEdit(row.live.session.id)}
                      onDelete={() => remove(row.live.session.id)}
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
                    <HostManagerRow
                      key={row.live.session.id}
                      row={row}
                      collapsed={null}
                      hiddenCount={0}
                      confirmingDelete={confirmingDeleteId === row.live.session.id}
                      onToggleCollapse={() => undefined}
                      onUse={() => onUse(row.live.session.id)}
                      onEdit={() => onEdit(row.live.session.id)}
                      onDelete={() => remove(row.live.session.id)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface HostManagerRowProps {
  readonly row: HostRow;
  readonly collapsed: boolean | null;
  readonly hiddenCount: number;
  readonly confirmingDelete: boolean;
  readonly onToggleCollapse: () => void;
  readonly onUse: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/**
 * One row: the name runs it into whatever slot asked for this panel, a
 * pencil opens `HostEditorDialog`, a trash icon deletes inline, the same
 * two-click confirm `MacrosSidebar`'s own rows use. Nesting and the
 * collapse disclosure are `HostsSection.tsx`'s `HostRowItem`, unchanged.
 */
function HostManagerRow({
  row,
  collapsed,
  hiddenCount,
  confirmingDelete,
  onToggleCollapse,
  onUse,
  onEdit,
  onDelete,
}: HostManagerRowProps): JSX.Element {
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
    <li className="hover:bg-surface-raised flex items-center rounded">
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
          <ChevronRightIcon className={`h-3 w-3 ${collapsed ? '' : 'rotate-90'}`} />
        </button>
      )}

      <button
        type="button"
        onClick={onUse}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded px-2 py-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <HostKindIcon kind={session.kind} className="text-ink-faint h-3 w-3 shrink-0" />
          <span className="text-ink-secondary truncate text-[12.5px]">{session.name}</span>
          {group !== null && (
            <span className="text-ink-muted bg-surface-raised ml-auto shrink-0 rounded px-1.5 py-px text-[9px]">
              {group}
            </span>
          )}
        </span>
        <span className="text-ink-faint truncate pl-[18px] font-mono text-[10.5px]">{subtitle}</span>
      </button>

      <button
        type="button"
        onClick={onEdit}
        aria-label={i18n.t('hosts.sidebar.edit', { name: session.name })}
        title={i18n.t('hosts.sidebar.edit', { name: session.name })}
        className="text-ink-faint hover:text-ink shrink-0 rounded p-1.5"
      >
        <EditIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={i18n.t('hosts.sidebar.delete', { name: session.name })}
        className={`shrink-0 rounded px-1.5 py-1 text-[10.5px] font-semibold ${
          confirmingDelete ? 'text-danger' : 'text-ink-faint hover:text-danger flex items-center'
        }`}
      >
        {confirmingDelete ? i18n.t('hosts.sidebar.deleteConfirm') : <TrashIcon className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}
