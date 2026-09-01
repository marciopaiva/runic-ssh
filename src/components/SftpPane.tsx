import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { pathSegments, selectionRange } from '../features/sftp/browser';
import { describeSftpFailure } from '../features/sftp/failure';
import { usePane } from '../features/sftp/use-pane';
import type { Endpoint, PaneEntry } from '../features/sftp/endpoint';
import { useTranslator } from '../features/settings';
import type { Translator } from '../lib/i18n';

import { BroadcastGlyph } from './BroadcastGlyph';

interface SftpPaneProps {
  readonly endpoint: Endpoint;
  /** `App.tsx`'s `SOURCE_PANE_ID`/`destinationPaneId(slot)`: how this
   * pane's own report is told apart from every other one's. */
  readonly paneId: string;
  /** `sftp.source`/`sftp.destination`, the small caption above the identity. */
  readonly label: string;
  /** `user@host` or `localhost`, drawn beside `label`. */
  readonly identity: string;
  /** Reports where this pane currently is, and how to make it look again,
   * up to the fan-out orchestration: `useFanout`'s own `reportPane`.
   * Called with `null` on unmount. */
  readonly onReport: (paneId: string, report: { readonly path: string | null; readonly reload: () => void } | null) => void;
  /** Present only on the source pane: sends a file to every occupied,
   * receiving destination. `null` on a destination pane, which only ever
   * receives. Called once per file selected, ADR-0047's own reading of
   * "check one row, press Send" covering the single-file case too. */
  readonly onSend: ((entry: PaneEntry) => void) | null;
  /** A destination slot's own way to clear itself, drawn beside its
   * identity. `null` on the source, which has nothing to clear to. */
  readonly onClear: (() => void) | null;
  /** Whether this destination slot receives a fan-out right now. `null` on
   * the source, which the question does not apply to (ADR-0047). */
  readonly receiving: boolean | null;
  readonly onToggleReceiving: (() => void) | null;
  /** The native "choose a file" dialog (ADR-0042), aimed at this one
   * destination. `null` on the source (nothing to browse for there) and on
   * a local destination (nothing here sends a file to itself). */
  readonly onUploadFromDialog: (() => void) | null;
  /** A file row has started being dragged out of this pane, carrying
   * whichever entries the drag actually means (this one alone, or the
   * whole current selection if the dragged row was part of it). `null` on
   * a destination, which is a target rather than a source for this. */
  readonly onDragEntriesStart: ((entries: readonly PaneEntry[]) => void) | null;
  readonly onDragEntriesEnd: (() => void) | null;
}

/** The folder icon, also drawn on the rail's own SFTP slot and the sidebar. */
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
export function formatSize(bytes: number): string {
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

export function formatModified(unixSecs: number | null): string {
  if (unixSecs === null) return '';
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A plain click selects only this row; the two modifier conventions every
 * file manager already uses. Shift extends a range from whichever row was
 * last plainly clicked; Ctrl (Cmd on macOS) adds or removes just this one
 * without touching the rest. */
export interface SelectModifiers {
  readonly shift: boolean;
  readonly additive: boolean;
}

interface RowProps {
  readonly name: string;
  readonly isDir: boolean;
  readonly size: number;
  readonly modifiedUnixSecs: number | null;
  readonly onOpen: () => void;
  /** `null` on a destination pane, and on a directory: only a source
   * pane's own files are selectable for sending (ADR-0047). */
  readonly selected: boolean | null;
  /** Clicking or activating the row itself, for a selectable file. `null`
   * wherever `selected` is: a directory still only ever opens. */
  readonly onSelectClick: ((modifiers: SelectModifiers) => void) | null;
  /** The checkbox's own plain toggle, independent of the row click above:
   * a precise tool that never touches the shift-range anchor. */
  readonly onToggleSelect: (() => void) | null;
  readonly selectLabel: string;
  /** Picking this row up to drop it on a destination pane. `null` wherever
   * `onSelectClick` is: only a selectable file is draggable at all. */
  readonly onDragStart: (() => void) | null;
  readonly onDragEnd: (() => void) | null;
}

function Row({
  name,
  isDir,
  size,
  modifiedUnixSecs,
  onOpen,
  selected,
  onSelectClick,
  onToggleSelect,
  selectLabel,
  onDragStart,
  onDragEnd,
}: RowProps): JSX.Element {
  const clickable = isDir || onSelectClick !== null;
  const draggable = onDragStart !== null;

  const activate = (modifiers: SelectModifiers): void => {
    if (isDir) {
      onOpen();
      return;
    }
    onSelectClick?.(modifiers);
  };

  return (
    <div
      role="button"
      tabIndex={clickable ? 0 : -1}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              /* A payload is set because some engines will not begin a drag
                 without one, the same convention `SessionsSidebar`'s own
                 rows use. What is actually being sent is held in the shell
                 (`useFanout`'s own state), not in `dataTransfer`, so
                 nothing dragged in from outside the window can pose as a
                 file this pane already has. */
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('text/plain', name);
              onDragStart?.();
            }
          : undefined
      }
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
      onClick={
        clickable
          ? (event) => activate({ shift: event.shiftKey, additive: event.ctrlKey || event.metaKey })
          : undefined
      }
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              activate({ shift: event.shiftKey, additive: event.ctrlKey || event.metaKey });
            }
          : undefined
      }
      className={`group flex items-center gap-2.5 px-2.5 py-[3px] ${clickable ? 'cursor-default' : ''} ${
        selected === true ? 'bg-accent-soft/30' : 'hover:bg-surface-raised/40'
      }`}
    >
      <span className="text-ink2 flex min-w-0 flex-1 items-center gap-2.5">
        {isDir ? (
          <FolderIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        ) : (
          <FileIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        )}
        <span className="text-ink truncate font-mono text-[12px]">{name}</span>
      </span>
      <span className="text-ink-muted w-[74px] shrink-0 text-right font-mono text-[11.5px]">
        {isDir ? '—' : formatSize(size)}
      </span>
      <span className="text-ink-faint w-[96px] shrink-0 text-right font-mono text-[11px]">
        {formatModified(modifiedUnixSecs)}
      </span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {onToggleSelect !== null && (
          <input
            type="checkbox"
            checked={selected === true}
            onChange={onToggleSelect}
            onClick={(event) => event.stopPropagation()}
            aria-label={selectLabel}
            title={selectLabel}
            className="accent-accent h-3.5 w-3.5"
          />
        )}
      </span>
    </div>
  );
}

interface NavBarProps {
  readonly i18n: Translator;
  readonly path: string | null;
  readonly canGoBack: boolean;
  readonly canGoUp: boolean;
  readonly onBack: () => void;
  readonly onUp: () => void;
  readonly onEnter: (path: string) => void;
  readonly onRefresh: () => void;
}

/**
 * Back, up, a clickable breadcrumb and refresh, below a pane's identity
 * header (ADR-0047). No forward: `usePane`'s own history is back-only,
 * which is the one direction this draws.
 */
function NavBar({ i18n, path, canGoBack, canGoUp, onBack, onUp, onEnter, onRefresh }: NavBarProps): JSX.Element {
  const segments = pathSegments(path ?? '');

  return (
    <div className="border-line-subtle bg-surface-chrome flex h-7 shrink-0 items-center gap-0.5 border-b px-1.5">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={onBack}
        aria-label={i18n.t('sftp.nav.back')}
        title={i18n.t('sftp.nav.back')}
        className="text-ink-muted enabled:hover:text-ink disabled:text-ink-disabled flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M14 5l-6 7 6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        disabled={!canGoUp}
        onClick={onUp}
        aria-label={i18n.t('sftp.nav.up')}
        title={i18n.t('sftp.nav.up')}
        className="text-ink-muted enabled:hover:text-ink disabled:text-ink-disabled flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M5 14l7-6 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {segments.length === 0 ? (
          <span className="text-ink-disabled font-mono text-[11px]">/</span>
        ) : (
          segments.map((segment, at) => (
            <span key={segment.path} className="flex shrink-0 items-center gap-1">
              {at > 0 && <span className="text-ink-disabled">/</span>}
              <button
                type="button"
                onClick={() => onEnter(segment.path)}
                /* The tail reads brighter than the rest, the same weight
                   rule a breadcrumb usually gives its own current segment
                   (matches the canvas's own `nav_bar()`). */
                className={`hover:text-ink truncate font-mono text-[11px] ${
                  at === segments.length - 1 ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {segment.label}
              </button>
            </span>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        aria-label={i18n.t('sftp.nav.refresh')}
        title={i18n.t('sftp.nav.refresh')}
        className="text-ink-muted hover:text-ink flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

interface SendBarProps {
  readonly i18n: Translator;
  readonly count: number;
  readonly onClear: () => void;
  readonly onSend: () => void;
}

/** The source pane's own way to start a transfer, once one or more files
 * are checked (ADR-0047). Replaces the previous hover-only send icon. The
 * panel tone (not the chrome the header and nav bar use) matches the
 * canvas's own `send_bar()`, which draws it as the sidebar's own surface
 * rather than one more chrome bar. */
function SendBar({ i18n, count, onClear, onSend }: SendBarProps): JSX.Element {
  return (
    <div className="border-line-subtle bg-surface-panel flex h-9 shrink-0 items-center gap-3 border-t px-2.5">
      <span className="text-ink-muted font-mono text-[11px]">
        {i18n.t('sftp.selected', { count: String(count) })}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="text-ink-faint hover:text-ink text-[11.5px]"
      >
        {i18n.t('sftp.clearSelection')}
      </button>
      <button
        type="button"
        onClick={onSend}
        aria-label={i18n.t('sftp.sendToDestinations')}
        title={i18n.t('sftp.sendToDestinations')}
        className="bg-accent text-surface-base flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold"
      >
        {i18n.t('sftp.send')}
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
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

/**
 * One pane: the source, or one destination slot. ADR-0045.
 *
 * Replaces #127's `SftpBrowser`, which owned a hardcoded local pane and a
 * hardcoded remote pane side by side. One of these is mounted per occupied
 * slot instead, each against whatever `Endpoint` it was dropped there:
 * `usePane` inside it does not know or care whether that endpoint is local
 * or remote.
 */
export function SftpPane({
  endpoint,
  paneId,
  label,
  identity,
  onReport,
  onSend,
  onClear,
  receiving,
  onToggleReceiving,
  onUploadFromDialog,
  onDragEntriesStart,
  onDragEntriesEnd,
}: SftpPaneProps): JSX.Element {
  const i18n = useTranslator();
  const pane = usePane(endpoint);
  /* Which of this pane's own files are checked, source only (`onSend` is
     `null` on a destination). Reset on every navigation: a selection made
     in one directory has nothing to say about the next one. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /* The row a shift-click extends a range from: whichever one was last
     plainly clicked. Cleared alongside `selected`, and never moved by a
     shift-click itself, the same convention every file manager already
     uses so a second shift-click from the same anchor can shrink a range
     it just grew. */
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);

  useEffect(() => {
    onReport(paneId, { path: pane.path, reload: () => pane.enter(pane.path) });
    return () => onReport(paneId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, pane.path, pane.enter, onReport]);

  useEffect(() => {
    setSelected(new Set());
    setSelectAnchor(null);
  }, [pane.path]);

  const open = (entry: PaneEntry): void => {
    if (entry.isDir) pane.enter(entry.path);
  };

  const toggleSelect = (path: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectFile = (entry: PaneEntry, modifiers: SelectModifiers): void => {
    if (modifiers.shift && selectAnchor !== null) {
      setSelected(new Set(selectionRange(pane.entries, selectAnchor, entry.path)));
      return;
    }

    if (modifiers.additive) {
      toggleSelect(entry.path);
      setSelectAnchor(entry.path);
      return;
    }

    setSelected(new Set([entry.path]));
    setSelectAnchor(entry.path);
  };

  /* Dragging a row that is part of the current selection carries the whole
     selection, the same "drag any one of the highlighted rows to move all
     of them" convention every file manager already uses; dragging a row
     outside it carries only that row, leaving the selection untouched. */
  const handleDragStart = (entry: PaneEntry): void => {
    if (onDragEntriesStart === null) return;
    const entries = selected.has(entry.path)
      ? pane.entries.filter((candidate) => selected.has(candidate.path))
      : [entry];
    onDragEntriesStart(entries);
  };

  return (
    <div className="border-line-subtle bg-surface-terminal flex h-full flex-col overflow-hidden rounded border">
      <div className="border-line-subtle bg-surface-chrome flex h-8 shrink-0 items-center gap-2.5 border-b px-2.5">
        <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.1em]">{label}</span>
        <span className="text-ink-muted truncate font-mono text-[11px]">{identity}</span>
        <span className="text-ink-disabled truncate font-mono text-[10.5px]">{pane.path ?? ''}</span>
        <div className="flex-1" />
        {onUploadFromDialog !== null && (
          <button
            type="button"
            onClick={onUploadFromDialog}
            aria-label={i18n.t('sftp.uploadFromDialog')}
            title={i18n.t('sftp.uploadFromDialog')}
            className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path
                d="M12 16V5M7 10l5-5 5 5M5 19h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {receiving !== null && onToggleReceiving !== null && (
          <button
            type="button"
            role="switch"
            aria-checked={receiving}
            onClick={onToggleReceiving}
            aria-label={i18n.t(receiving ? 'sftp.receiving.on' : 'sftp.receiving.off')}
            title={i18n.t(receiving ? 'sftp.receiving.on' : 'sftp.receiving.off')}
            className={`flex h-4 w-4 shrink-0 items-center justify-center ${
              receiving ? 'text-warn' : 'text-ink-faint hover:text-ink-muted'
            }`}
          >
            <BroadcastGlyph className="h-3.5 w-3.5" />
          </button>
        )}
        {onClear !== null && (
          <button
            type="button"
            onClick={onClear}
            aria-label={i18n.t('sftp.clearSlot')}
            title={i18n.t('sftp.clearSlot')}
            className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center"
          >
            <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        )}
      </div>

      <NavBar
        i18n={i18n}
        path={pane.path}
        canGoBack={pane.history.length > 0}
        canGoUp={pane.parent !== null}
        onBack={pane.back}
        onUp={pane.goUp}
        onEnter={pane.enter}
        onRefresh={() => pane.enter(pane.path)}
      />

      {/* `pr-2` is dead space, not a column: an overlay scrollbar (WebKit's
          own on Linux) draws on top of the content rather than reserving
          its own width, and with none to spare here it sat directly over
          the last column's own checkbox, which a click then landed on
          instead of reaching. `SessionSurface.tsx` solves the same failure
          with a cancelled margin, since it wants the scrollbar flush with
          the window's edge; nothing here needs that, only somewhere empty
          for the thumb to sit that isn't the checkbox underneath it. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto py-1 pr-2"
        onKeyDown={
          onSend === null
            ? undefined
            : (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
                  event.preventDefault();
                  setSelected(new Set(pane.entries.filter((entry) => !entry.isDir).map((entry) => entry.path)));
                }
              }
        }
      >
        <Header i18n={i18n} />
        {pane.error !== null && (
          <p className="text-danger-text px-2.5 py-2 text-[12px]">{i18n.t(describeSftpFailure(pane.error))}</p>
        )}
        {pane.error === null && pane.parent !== null && (
          <Row
            name=".."
            isDir
            size={0}
            modifiedUnixSecs={null}
            onOpen={() => pane.enter(pane.parent)}
            selected={null}
            onSelectClick={null}
            onToggleSelect={null}
            selectLabel=""
            onDragStart={null}
            onDragEnd={null}
          />
        )}
        {pane.error === null && !pane.loading && pane.entries.length === 0 && (
          <p className="text-ink-faint px-2.5 py-2 text-[12px]">{i18n.t('sftp.empty')}</p>
        )}
        {pane.error === null &&
          pane.entries.map((entry) => (
            <Row
              key={entry.path}
              name={entry.name}
              isDir={entry.isDir}
              size={entry.size}
              modifiedUnixSecs={entry.modifiedUnixSecs}
              onOpen={() => open(entry)}
              selected={onSend === null || entry.isDir ? null : selected.has(entry.path)}
              onSelectClick={onSend === null || entry.isDir ? null : (modifiers) => selectFile(entry, modifiers)}
              onToggleSelect={onSend === null || entry.isDir ? null : () => toggleSelect(entry.path)}
              selectLabel={i18n.t('sftp.selectFile', { name: entry.name })}
              onDragStart={
                onSend === null || onDragEntriesStart === null || entry.isDir
                  ? null
                  : () => handleDragStart(entry)
              }
              onDragEnd={onDragEntriesEnd}
            />
          ))}
      </div>

      {onSend !== null && selected.size > 0 && (
        <SendBar
          i18n={i18n}
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onSend={() => {
            for (const entry of pane.entries) {
              if (selected.has(entry.path)) onSend(entry);
            }
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
