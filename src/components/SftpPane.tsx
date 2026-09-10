import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { pathSegments, selectionRange } from '../features/sftp/browser';
import { describeSftpFailure } from '../features/sftp/failure';
import { usePane } from '../features/sftp/use-pane';
import type { Endpoint, PaneEntry } from '../features/sftp/endpoint';
import { useTranslator } from '../features/settings';
import type { Translator } from '../lib/i18n';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Tooltip } from './ui/Tooltip';
import { cn } from '../lib/classnames';
import {
  ChevronLeftIcon,
  ChevronUpIcon,
  PlusIcon,
  RefreshCwIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  SendIcon,
  FolderIcon,
  FileIcon,
} from './ui/icons';
import { GroupMenu } from './GroupMenu';
import type { GroupMenuItem } from './GroupMenu';
import { BroadcastGlyph } from './BroadcastGlyph';
import { SftpDeleteConfirm } from './SftpDeleteConfirm';

interface SftpPaneProps {
  readonly endpoint: Endpoint;
  readonly paneId: string;
  readonly label: string;
  readonly identity: string;
  readonly onReport: (paneId: string, report: { readonly path: string | null; readonly reload: () => void } | null) => void;
  readonly onSend: ((entry: PaneEntry) => void) | null;
  readonly onClear: () => void;
  readonly receiving: boolean | null;
  readonly onToggleReceiving: (() => void) | null;
  readonly onDragEntriesStart: ((entries: readonly PaneEntry[]) => void) | null;
  readonly onDragEntriesEnd: (() => void) | null;
}

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
  readonly selected: boolean | null;
  readonly onSelectClick: ((modifiers: SelectModifiers) => void) | null;
  readonly onDragStart: (() => void) | null;
  readonly onDragEnd: (() => void) | null;
  readonly editing: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onCommit: () => void;
    readonly onCancel: () => void;
  } | null;
  readonly onContextMenu: ((point: { readonly x: number; readonly y: number }) => void) | null;
}

function Row({
  name,
  isDir,
  size,
  modifiedUnixSecs,
  onOpen,
  selected,
  onSelectClick,
  onDragStart,
  onDragEnd,
  editing,
  onContextMenu,
}: RowProps): JSX.Element {
  const clickable = editing === null && (isDir || onSelectClick !== null);
  const draggable = editing === null && onDragStart !== null;

  const selectOrOpen = (modifiers: SelectModifiers): void => {
    if (onSelectClick === null) {
      onOpen();
      return;
    }
    onSelectClick(modifiers);
  };

  const activateByKeyboard = (modifiers: SelectModifiers): void => {
    if (isDir && (onSelectClick === null || (!modifiers.shift && !modifiers.additive))) {
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
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('text/plain', name);
              onDragStart?.();
            }
          : undefined
      }
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
      onClick={
        clickable
          ? (event) => selectOrOpen({ shift: event.shiftKey, additive: event.ctrlKey || event.metaKey })
          : undefined
      }
      onDoubleClick={clickable && isDir ? () => onOpen() : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              activateByKeyboard({ shift: event.shiftKey, additive: event.ctrlKey || event.metaKey });
            }
          : undefined
      }
      onContextMenu={
        onContextMenu === null
          ? undefined
          : (event) => {
              event.preventDefault();
              onContextMenu({ x: event.clientX, y: event.clientY });
            }
      }
      className={cn(
        'group flex items-center gap-2.5 px-2.5 py-[3px]',
        clickable ? 'cursor-default' : '',
        selected === true ? 'bg-accent-soft/30' : 'hover:bg-surface-raised/40',
      )}
    >
      <span className="text-ink2 flex min-w-0 flex-1 items-center gap-2.5">
        {isDir ? (
          <FolderIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        ) : (
          <FileIcon className="text-ink-faint h-[13px] w-[13px] shrink-0" />
        )}
        {editing === null ? (
          <span className="text-ink truncate font-mono text-[12px]">{name}</span>
        ) : (
          <input
            type="text"
            value={editing.value}
            onChange={(event) => editing.onChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                editing.onCommit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                editing.onCancel();
              }
            }}
            onBlur={() => editing.onCancel()}
            onFocus={(event) => event.currentTarget.select()}
            autoFocus
            className="bg-surface-input border-accent text-ink min-w-0 flex-1 rounded border px-1 py-0 font-mono text-[12px] outline-none"
          />
        )}
      </span>
      <span className="text-ink-muted w-[74px] shrink-0 text-right font-mono text-[11.5px]">
        {isDir ? '—' : formatSize(size)}
      </span>
      <span className="text-ink-faint w-[96px] shrink-0 text-right font-mono text-[11px]">
        {formatModified(modifiedUnixSecs)}
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
  readonly onNewFolder: () => void;
  readonly selectedCount: number;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}

function NavBar({
  i18n,
  path,
  canGoBack,
  canGoUp,
  onBack,
  onUp,
  onEnter,
  onRefresh,
  onNewFolder,
  selectedCount,
  onRename,
  onDelete,
}: NavBarProps): JSX.Element {
  const segments = pathSegments(path ?? '');

  return (
    <div className="border-line-subtle bg-surface-chrome flex h-7 shrink-0 items-center gap-0.5 border-b px-1.5">
      <Tooltip content={i18n.t('sftp.nav.back')} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoBack}
          onClick={onBack}
          aria-label={i18n.t('sftp.nav.back')}
          className="h-5 w-5"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content={i18n.t('sftp.nav.up')} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canGoUp}
          onClick={onUp}
          aria-label={i18n.t('sftp.nav.up')}
          className="h-5 w-5"
        >
          <ChevronUpIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {segments.length === 0 ? (
          <span className="text-ink-disabled font-mono text-[11px]">/</span>
        ) : (
          segments.map((segment, at) => (
            <span key={segment.path} className="flex shrink-0 items-center gap-1">
              {at > 0 && <span className="text-ink-disabled">/</span>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEnter(segment.path)}
                className={cn(
                  'hover:text-ink truncate font-mono text-[11px]',
                  at === segments.length - 1 ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {segment.label}
              </Button>
            </span>
          ))
        )}
      </div>

      <Tooltip content={i18n.t('sftp.nav.newFolder')} side="bottom">
        <Button variant="ghost" size="sm" onClick={onNewFolder} aria-label={i18n.t('sftp.nav.newFolder')} className="h-5 w-5">
          <PlusIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content={i18n.t('sftp.nav.refresh')} side="bottom">
        <Button variant="ghost" size="sm" onClick={onRefresh} aria-label={i18n.t('sftp.nav.refresh')} className="h-5 w-5">
          <RefreshCwIcon className="h-3 w-3" />
        </Button>
      </Tooltip>
      <Tooltip content={i18n.t('sftp.menu.rename')} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          disabled={selectedCount !== 1}
          onClick={onRename}
          aria-label={i18n.t('sftp.menu.rename')}
          className="h-5 w-5"
        >
          <EditIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
      <Tooltip content={i18n.t('sftp.menu.delete')} side="bottom">
        <Button
          variant="ghost"
          size="sm"
          disabled={selectedCount < 1}
          onClick={onDelete}
          aria-label={i18n.t('sftp.menu.delete')}
          className="h-5 w-5 text-danger-text hover:opacity-80"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
}

interface SendBarProps {
  readonly i18n: Translator;
  readonly count: number;
  readonly onClear: () => void;
  readonly onSend: () => void;
}

function SendBar({ i18n, count, onClear, onSend }: SendBarProps): JSX.Element {
  return (
    <div className="border-line-subtle bg-surface-panel flex h-9 shrink-0 items-center gap-3 border-t px-2.5">
      <span className="text-ink-muted font-mono text-[11px]">
        {i18n.t('sftp.selected', { count: String(count) })}
      </span>
      <div className="flex-1" />
      <Tooltip content={i18n.t('sftp.clearSelection')} side="bottom">
        <Button variant="ghost" size="sm" onClick={onClear} className="text-[11.5px]">
          {i18n.t('sftp.clearSelection')}
        </Button>
      </Tooltip>
      <Button variant="primary" size="sm" onClick={onSend} aria-label={i18n.t('sftp.sendToDestinations')}>
        <SendIcon className="h-3 w-3" />
        {i18n.t('sftp.send')}
      </Button>
    </div>
  );
}

function Header({ i18n }: { readonly i18n: Translator }): JSX.Element {
  return (
    <div className="text-ink-faint flex items-center gap-2.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.08em]">
      <span className="flex-1">{i18n.t('sftp.column.name')}</span>
      <span className="w-[74px] text-right">{i18n.t('sftp.column.size')}</span>
      <span className="w-[96px] text-right">{i18n.t('sftp.column.modified')}</span>
    </div>
  );
}

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
  onDragEntriesStart,
  onDragEntriesEnd,
}: SftpPaneProps): JSX.Element {
  const i18n = useTranslator();
  const pane = usePane(endpoint);
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);

  useEffect(() => {
    onReport(paneId, { path: pane.path, reload: () => pane.enter(pane.path) });
    return () => onReport(paneId, null);
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

  const handleDragStart = (entry: PaneEntry): void => {
    if (onDragEntriesStart === null) return;
    const entries = selected.has(entry.path)
      ? pane.entries.filter((candidate) => selected.has(candidate.path))
      : [entry];
    onDragEntriesStart(entries);
  };

  const [creating, setCreating] = useState<{ readonly value: string } | null>(null);
  const [renaming, setRenaming] = useState<{ readonly path: string; readonly value: string } | null>(null);
  const [menu, setMenu] = useState<{
    readonly at: { readonly x: number; readonly y: number };
    readonly entry: PaneEntry;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<readonly PaneEntry[] | null>(null);

  useEffect(() => {
    setCreating(null);
    setRenaming(null);
    setMenu(null);
    setConfirmingDelete(null);
  }, [pane.path]);

  const selectedEntries = (): readonly PaneEntry[] =>
    pane.entries.filter((entry) => selected.has(entry.path));

  const renameSoleSelected = (): void => {
    const entries = selectedEntries();
    if (entries.length === 1) startRenaming(entries[0] as PaneEntry);
  };

  const requestDelete = (targets: readonly PaneEntry[]): void => {
    if (targets.length === 0) return;
    setConfirmingDelete(targets);
  };

  const confirmDelete = (): void => {
    if (confirmingDelete === null) return;
    const deleted = new Set(confirmingDelete.map((target) => target.path));
    pane.removeEntries(confirmingDelete.map((target) => ({ name: target.name, isDir: target.isDir })));
    setConfirmingDelete(null);
    setSelected((current) => new Set([...current].filter((path) => !deleted.has(path))));
    refocusList();
  };

  const refocusList = (): void => {
    listRef.current?.focus();
  };

  const startCreating = (): void => {
    if (creating !== null) return;
    setCreating({ value: i18n.t('sftp.newFolder.defaultName') });
  };

  const commitCreating = (): void => {
    const value = creating?.value.trim() ?? '';
    if (value !== '') pane.createDirectory(value);
    setCreating(null);
    refocusList();
  };

  const startRenaming = (entry: PaneEntry): void => {
    setRenaming({ path: entry.path, value: entry.name });
  };

  const commitRenaming = (entry: PaneEntry): void => {
    const value = renaming?.value.trim() ?? '';
    if (value !== '' && value !== entry.name) pane.renameEntry(entry.name, value);
    setRenaming(null);
    refocusList();
  };

  const menuItemsFor = (entry: PaneEntry): readonly GroupMenuItem[] => {
    const multi = selected.has(entry.path) && selected.size > 1;
    const targets = multi ? pane.entries.filter((candidate) => selected.has(candidate.path)) : [entry];

    const items: GroupMenuItem[] = [];
    if (!multi) {
      items.push({
        id: 'rename',
        label: i18n.t('sftp.menu.rename'),
        run: () => {
          setMenu(null);
          startRenaming(entry);
        },
      });
    }
    items.push({
      id: 'delete',
      label: i18n.t('sftp.menu.delete'),
      ...(multi
        ? { detail: i18n.t('sftp.menu.delete.detail.selected', { count: String(targets.length) }) }
        : entry.isDir
          ? { detail: i18n.t('sftp.menu.delete.detail.folder') }
          : {}),
      destructive: true,
      run: () => {
        setMenu(null);
        requestDelete(targets);
      },
    });
    return items;
  };

  return (
    <Card variant="outlined" className="relative flex h-full flex-col overflow-hidden">
      <div className="border-line-subtle bg-surface-chrome flex h-8 shrink-0 items-center gap-2.5 border-b px-2.5">
        <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.1em]">{label}</span>
        <span className="text-ink-muted truncate font-mono text-[11px]">{identity}</span>
        <span className="text-ink-disabled truncate font-mono text-[10.5px]">{pane.path ?? ''}</span>
        <div className="flex-1" />
        {receiving !== null && onToggleReceiving !== null && (
          <Tooltip content={i18n.t(receiving ? 'sftp.receiving.on' : 'sftp.receiving.off')} side="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleReceiving}
              aria-label={i18n.t(receiving ? 'sftp.receiving.on' : 'sftp.receiving.off')}
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center',
                receiving ? 'text-warn' : 'text-ink-faint hover:text-ink-muted',
              )}
            >
              <BroadcastGlyph className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={i18n.t('sftp.clearSlot')} side="bottom">
          <Button variant="ghost" size="sm" onClick={onClear} aria-label={i18n.t('sftp.clearSlot')} className="h-4 w-4">
            <XIcon className="h-2 w-2" />
          </Button>
        </Tooltip>
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
        onNewFolder={startCreating}
        selectedCount={selected.size}
        onRename={renameSoleSelected}
        onDelete={() => requestDelete(selectedEntries())}
      />

      {pane.actionError !== null && (
        <Card variant="filled" className="border-b border-line-subtle">
          <p className="text-danger-text px-2.5 py-1.5 text-[11.5px]">
            {i18n.t(describeSftpFailure(pane.actionError))}
          </p>
        </Card>
      )}

      <div
        ref={listRef}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto py-1 pr-2 outline-none"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            setSelected(new Set(pane.entries.map((entry) => entry.path)));
            return;
          }
          if (event.key === 'F2') {
            renameSoleSelected();
            return;
          }
          if (event.key === 'Delete' || event.key === 'Backspace') {
            requestDelete(selectedEntries());
          }
        }}
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
            onDragStart={null}
            onDragEnd={null}
            editing={null}
            onContextMenu={null}
          />
        )}
        {pane.error === null && creating !== null && (
          <Row
            name={creating.value}
            isDir
            size={0}
            modifiedUnixSecs={null}
            onOpen={() => undefined}
            selected={null}
            onSelectClick={null}
            onDragStart={null}
            onDragEnd={null}
            editing={{
              value: creating.value,
              onChange: (value) => setCreating({ value }),
              onCommit: commitCreating,
              onCancel: () => {
                setCreating(null);
                refocusList();
              },
            }}
            onContextMenu={null}
          />
        )}
        {pane.error === null && creating === null && !pane.loading && pane.entries.length === 0 && (
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
              selected={selected.has(entry.path)}
              onSelectClick={(modifiers) => selectFile(entry, modifiers)}
              onDragStart={
                onSend === null || onDragEntriesStart === null ? null : () => handleDragStart(entry)
              }
              onDragEnd={onDragEntriesEnd}
              editing={
                renaming !== null && renaming.path === entry.path
                  ? {
                      value: renaming.value,
                      onChange: (value) => setRenaming({ path: entry.path, value }),
                      onCommit: () => commitRenaming(entry),
                      onCancel: () => {
                        setRenaming(null);
                        refocusList();
                      },
                    }
                  : null
              }
              onContextMenu={(point) => setMenu({ at: point, entry })}
            />
          ))}
      </div>

      {menu !== null && (
        <GroupMenu
          items={menuItemsFor(menu.entry)}
          at={menu.at}
          label={menu.entry.name}
          onDismiss={() => setMenu(null)}
        />
      )}

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

      {confirmingDelete !== null && (
        <div className="absolute inset-0 z-20">
          <SftpDeleteConfirm
            targets={confirmingDelete}
            onConfirm={confirmDelete}
            onCancel={() => {
              setConfirmingDelete(null);
              refocusList();
            }}
          />
        </div>
      )}
    </Card>
  );
}