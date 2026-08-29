import type { JSX, KeyboardEvent } from 'react';

import { focusAfter, panelElementId, sameFocus, tabElementId } from '../features/chrome';
import type { Focus, Tab } from '../features/chrome';
import type { EditorTarget } from '../features/sessions';
import type { GroupLabel } from '../features/terminal';
import type { Translator } from '../lib/i18n';
import { useTranslator } from '../features/settings';

import { SessionMarker } from './SessionMarker';
import { SyncToggle } from './SyncToggle';
import type { SyncState } from './SyncToggle';

/** What a tab says it is, for a session, a host form or the settings page. */
export interface EditorTab {
  readonly target: EditorTarget;
  readonly title: string;
  readonly dirty: boolean;
}

/**
 * The name on a tab.
 *
 * Exported because the group's menu is about one tab and has to name it, and
 * a second copy of this in the shell is how a menu ends up calling something
 * by a name the strip stopped using.
 */
export function entryTitle(
  entry: Focus,
  tabs: readonly Tab[],
  editorTabs: readonly EditorTab[],
  i18n: Translator,
): string {
  if (entry.kind === 'settings') return i18n.t('tabs.settings');

  if (entry.kind === 'editor') {
    const editor = editorTabs.find((candidate) =>
      sameFocus({ kind: 'editor', target: candidate.target }, entry),
    );
    return editor?.title ?? '';
  }

  return tabs.find((candidate) => candidate.sessionId === entry.sessionId)?.title ?? '';
}

interface GroupStripProps {
  /** Everything this group holds, in the order it is drawn. */
  readonly entries: readonly Focus[];
  /** The one this group is showing. */
  readonly active: Focus | null;
  /** What the window is pointing at, which may be in another group. */
  readonly focus: Focus | null;
  /** The open sessions, for a session tab's name and connection marker. */
  readonly tabs: readonly Tab[];
  /** One per open host form: what its tab says, and whether it is unsaved. */
  readonly editorTabs: readonly EditorTab[];
  /** `user@host` per session, drawn beside the name when there is room. */
  readonly labels: ReadonlyMap<string, GroupLabel>;
  /** More than one group on screen: names get terse and the keyboard marker appears. */
  readonly dense: boolean;
  /** What this strip is called, for a screen reader walking four of them. */
  readonly label: string;
  /**
   * What this rectangle does with what you type, or `null` when the question
   * does not apply: the active tab is a host form or settings, not a session.
   */
  readonly sync: SyncState | null;
  readonly onToggleSync: () => void;
  readonly onFocus: (focus: Focus) => void;
  /** Closing any tab, whichever kind. The shell knows what each one means. */
  readonly onClose: (focus: Focus) => void;
  /**
   * Opens this group's menu, about the tab it was asked on.
   *
   * Right-click only. The button that used to sit at the trailing edge is
   * gone: everything it offered is either a drag away or in the palette, and
   * two icons on every strip is a lot of chrome for a window that can hold
   * four of them.
   */
  readonly onMenu: (entry: Focus, at: { readonly x: number; readonly y: number }) => void;
  /** Which tab is being dragged, or `null` when a drag ends or never began. */
  readonly onDrag: (entry: Focus | null) => void;
}

/**
 * The tabs of one group.
 *
 * ADR-0020 rule 2: a group owns its tabs, and there is no second mechanism
 * naming a rectangle. This strip is both the tab bar and the pane header that
 * used to sit under it. The two were separate objects answering one question,
 * and nothing failed when they disagreed.
 *
 * Everything opened is a tab (rule 3), which costs nothing here because a
 * group holds `Focus` values and that union already covered a session, a host
 * form and the settings surface.
 *
 * The switch at the trailing edge is not decoration. It is the one control
 * that decides where a keystroke lands, and it is here rather than in the top
 * strip because it means something per rectangle: which of them receive is a
 * real question about each one. A control repeated on four strips that means
 * one thing four times is what ADR-0021 refused for the shape; this reads as
 * four switches because it is four switches.
 */
export function GroupStrip({
  entries,
  active,
  focus,
  tabs,
  editorTabs,
  labels,
  dense,
  label,
  sync,
  onToggleSync,
  onFocus,
  onClose,
  onMenu,
  onDrag,
}: GroupStripProps): JSX.Element {
  const i18n = useTranslator();

  /* Automatic activation, which is what a tab strip is expected to do: the
     arrow key both moves and switches. Focus follows, or the next arrow press
     would start over from wherever focus was left behind.

     The ring is this group's entries and not the window's. Walking out of one
     rectangle into another by pressing right is a way to lose your place, and
     moving between groups is #122 rather than a side effect of this. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : null;
    if (step === null) return;

    const next = focusAfter(entries, active, step);
    if (next === null) return;

    event.preventDefault();
    onFocus(next);
    queueMicrotask(() => document.getElementById(tabElementId(next))?.focus());
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="bg-surface-chrome border-line-subtle flex h-7 shrink-0 items-stretch overflow-x-auto border-b"
    >
      {entries.map((entry) => {
        const showing = sameFocus(entry, active);
        const hasKeyboard = showing && sameFocus(entry, focus);
        const id = tabElementId(entry);

        const tab =
          entry.kind === 'session'
            ? (tabs.find((candidate) => candidate.sessionId === entry.sessionId) ?? null)
            : null;

        const editor =
          entry.kind === 'editor'
            ? (editorTabs.find((candidate) =>
                sameFocus({ kind: 'editor', target: candidate.target }, entry),
              ) ?? null)
            : null;

        const title = entryTitle(entry, tabs, editorTabs, i18n);

        /* Only on the tab that is showing, and only when there is room for it.
           With four groups the name is all that fits, and pushing it out of
           view to make space for the address would lose the more useful half. */
        const where =
          !dense && showing && entry.kind === 'session'
            ? (labels.get(entry.sessionId)?.where ?? null)
            : null;

        const closeLabel =
          editor?.dirty === true
            ? i18n.t('tabs.editor.unsaved')
            : i18n.t('tabs.close', { name: title });

        return (
          <div
            key={id}
            role="presentation"
            /* Dragging a tab into another rectangle. The pointer path only:
               the menu beside it and the palette are how this is done from a
               keyboard, and they were built first for that reason.

               A payload is set even though nothing reads it. Some engines
               refuse to begin a drag without one, and what is being moved is
               held in the shell rather than in `dataTransfer`, so that
               something dragged in from outside the window can never be
               mistaken for a tab. */
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', title);
              onDrag(entry);
            }}
            onDragEnd={() => onDrag(null)}
            /* Right-click is the convention. The button at the trailing edge
               is what somebody finds without knowing the convention, and it
               opens the same menu about whichever tab is showing. */
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(entry, { x: event.clientX, y: event.clientY });
            }}
            className={`border-line-subtle flex min-w-0 shrink-0 items-center gap-[7px] border-r px-[11px] ${
              showing ? 'bg-surface-terminal border-t-2 border-t-accent' : 'hover:bg-surface-raised/40'
            }`}
          >
            <button
              type="button"
              role="tab"
              id={id}
              aria-selected={showing}
              aria-controls={panelElementId(entry)}
              /* Roving tabindex: one stop for the whole strip, and the arrow
                 keys move within it. */
              tabIndex={showing ? 0 : -1}
              onClick={() => onFocus(entry)}
              className={`flex h-full min-w-0 items-center gap-[7px] text-[11.5px] ${
                showing ? 'text-ink font-semibold' : 'text-ink-muted'
              }`}
            >
              {entry.kind === 'session' && tab !== null && <SessionMarker kind={tab.kind} />}

              {entry.kind === 'editor' && (
                <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" aria-hidden="true">
                  <path
                    d="M11.2 2.4l2.4 2.4-7.4 7.4-3 .6.6-3z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
              )}

              {entry.kind === 'settings' && (
                <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6L3.3 3.3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              )}

              <span className="max-w-[180px] truncate">{title}</span>

              {where !== null && (
                <span className="text-ink-faint shrink-0 font-mono text-[10.5px] font-normal">
                  {where}
                </span>
              )}

              {editor?.dirty === true && (
                /* A dot rather than an asterisk in the label: the label is
                   translated and an asterisk glued to it reads as part of the
                   word in some of them. The name is on the button for anybody
                   who is not looking at it. */
                <span
                  aria-hidden="true"
                  className="bg-accent inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => onClose(entry)}
              aria-label={closeLabel}
              title={closeLabel}
              className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded"
            >
              <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
                <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>

            {hasKeyboard && dense && (
              /* Which rectangle the status bar is describing. With typing
                 synchronised every group carries the same warning border on
                 purpose, which leaves the border with nothing left to say
                 about focus. */
              <span className="text-ink-secondary shrink-0 font-mono text-[10px] font-bold tracking-[0.08em]">
                {i18n.t('terminal.group.focused')}
              </span>
            )}
          </div>
        );
      })}

      <div className="min-w-0 flex-1" />

      {/* At the end of the strip of the rectangle it decides for. It was a
          square on the active tab, which meant it appeared only once something
          was armed, and nothing anywhere could arm it but the palette.

          Absent rather than disabled when `sync` is `null`: the active tab is
          not a session, so which of them receive typed keys is not a question
          this rectangle has an answer to. */}
      {sync !== null && (
        <div className="flex shrink-0 items-center pr-2">
          <SyncToggle state={sync} onToggle={onToggleSync} />
        </div>
      )}
    </div>
  );
}
