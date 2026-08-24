import type { JSX, KeyboardEvent } from 'react';

import { focusAfter, sameFocus } from '../features/chrome';
import type { Focus, Tab, WindowAction, WindowControl } from '../features/chrome';
import type { EditorTarget } from '../features/sessions';
import { useTranslator } from '../features/settings';

import { SessionMarker } from './SessionMarker';
import { WindowControls } from './WindowControls';

interface TitlebarProps {
  /** Everything on the strip, in the order it is drawn. */
  readonly entries: readonly Focus[];
  /** The open sessions, for a session tab's name and connection marker. */
  readonly tabs: readonly Tab[];
  /** Which tab is showing, whatever kind it is. */
  readonly focus: Focus | null;
  /** One per open host form: what its tab says, and whether it is unsaved. */
  readonly editorTabs: readonly {
    readonly target: EditorTarget;
    readonly title: string;
    readonly dirty: boolean;
  }[];
  readonly controls: readonly WindowControl[];
  /** Space to keep clear at the leading edge for controls the system draws. */
  readonly leadingInset: number;
  /** The element the tabs switch between, for screen readers. */
  readonly panelId: string;
  readonly onFocus: (focus: Focus) => void;
  /** Closing any tab, whichever kind. The shell knows what each one means. */
  readonly onClose: (focus: Focus) => void;
  readonly onAct: (action: WindowAction) => void;
}

/** The DOM id of whichever tab a focus points at, for moving focus by keyboard. */
function elementId(focus: Focus): string {
  if (focus.kind === 'settings') return 'settings-tab';
  if (focus.kind === 'editor') {
    return focus.target.kind === 'new' ? 'editor-tab-new' : `editor-tab-${focus.target.sessionId}`;
  }

  return `session-tab-${focus.sessionId}`;
}

/**
 * The window's own titlebar.
 *
 * ADR-0005: the window is undecorated on Windows and Linux, and on macOS the
 * native traffic lights float over this bar with `leadingInset` reserved for
 * them. The tab strip lives here on purpose — the mockup's centred search bar
 * would steal that slot, so the denser visual treatment stays on the tabs and
 * the mark rather than relocating chrome the ADR already claimed.
 */
export function Titlebar({
  entries,
  tabs,
  focus,
  editorTabs,
  controls,
  leadingInset,
  panelId,
  onFocus,
  onClose,
  onAct,
}: TitlebarProps): JSX.Element {
  const i18n = useTranslator();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : null;
    if (step === null) return;

    const next = focusAfter(entries, focus, step);
    if (next === null) return;

    event.preventDefault();
    onFocus(next);
    voidMicrotask(() => document.getElementById(elementId(next))?.focus());
  };

  return (
    <header
      data-tauri-drag-region="deep"
      className="bg-surface-chrome border-line-subtle flex h-10 shrink-0 items-stretch gap-2 border-b"
      style={{ paddingLeft: `${leadingInset}px` }}
    >
      <div className="flex shrink-0 items-center gap-2.5 pl-3.5">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          role="img"
          aria-label={i18n.t('app.name')}
        >
          <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.5" />
          <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.5" />
          <path
            d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
            className="stroke-brand-rune"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-ink text-[13px] font-semibold tracking-tight">
          {i18n.t('app.name')}
        </span>
      </div>

      {entries.length === 0 ? (
        <span className="text-ink-faint self-center text-[11.5px]">{i18n.t('tabs.empty')}</span>
      ) : (
        <div
          role="tablist"
          aria-label={i18n.t('tabs.label')}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="flex min-w-0 items-stretch gap-1 overflow-x-auto py-1.5"
        >
          {entries.map((entry) => {
            const active = sameFocus(entry, focus);
            const id = elementId(entry);

            const tab = entry.kind === 'session'
              ? (tabs.find((candidate) => candidate.sessionId === entry.sessionId) ?? null)
              : null;

            const editor = entry.kind === 'editor'
              ? (editorTabs.find((candidate) =>
                  sameFocus({ kind: 'editor', target: candidate.target }, entry),
                ) ?? null)
              : null;

            const title =
              entry.kind === 'session'
                ? (tab?.title ?? '')
                : entry.kind === 'editor'
                  ? (editor?.title ?? '')
                  : i18n.t('tabs.settings');

            const closeLabel =
              editor?.dirty === true
                ? i18n.t('tabs.editor.unsaved')
                : i18n.t('tabs.close', { name: title });

            return (
              <div
                key={id}
                role="presentation"
                className={`relative flex min-w-0 shrink-0 items-center gap-1.5 rounded-md px-2.5 ${
                  active
                    ? 'bg-surface-raised shadow-[inset_0_-2px_0_0_var(--color-accent)]'
                    : 'hover:bg-surface-raised/50'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  id={id}
                  aria-selected={active}
                  aria-controls={panelId}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onFocus(entry)}
                  className={`flex h-7 min-w-0 items-center gap-2 text-[12.5px] ${
                    active ? 'text-ink font-semibold' : 'text-ink-secondary'
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

                  {editor?.dirty === true && (
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
                  className="text-ink-faint hover:bg-surface-base hover:text-ink flex h-5 w-5 shrink-0 items-center justify-center rounded"
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
                    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="min-w-0 flex-1" />

      <WindowControls controls={controls} onAct={onAct} />
    </header>
  );
}
