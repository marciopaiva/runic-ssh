import type { JSX, KeyboardEvent } from 'react';

import { focusAfter } from '../features/chrome';
import type { Focus, Tab, WindowAction, WindowControl } from '../features/chrome';
import { useTranslator } from '../features/settings';

import { SessionMarker } from './SessionMarker';
import { WindowControls } from './WindowControls';

interface TitlebarProps {
  readonly tabs: readonly Tab[];
  /** Which tab is showing, sessions and settings alike. */
  readonly focus: Focus | null;
  /** Whether the settings tab is on the strip at all. */
  readonly settingsOpen: boolean;
  /** Whether the settings tab holds work that has never been saved. */
  readonly settingsDirty: boolean;
  readonly controls: readonly WindowControl[];
  /** Space to keep clear at the leading edge for controls the system draws. */
  readonly leadingInset: number;
  /** The element the tabs switch between, for screen readers. */
  readonly panelId: string;
  readonly onFocus: (focus: Focus) => void;
  readonly onClose: (sessionId: string) => void;
  readonly onCloseSettings: () => void;
  readonly onAct: (action: WindowAction) => void;
}

const tabId = (sessionId: string): string => `session-tab-${sessionId}`;
const SETTINGS_TAB_ID = 'settings-tab';

/** The DOM id of whichever tab a focus points at, for moving focus by keyboard. */
function elementId(focus: Focus): string {
  return focus.kind === 'settings' ? SETTINGS_TAB_ID : tabId(focus.sessionId);
}

/**
 * The window's own titlebar.
 *
 * ADR-0005: the window is undecorated on Windows and Linux, and on macOS the
 * native traffic lights float over this bar with `leadingInset` reserved for
 * them. Everything the OS used to do up here is now ours — dragging the window
 * is `data-tauri-drag-region`, double-click to maximise comes with it, and the
 * buttons at the trailing edge are drawn by us or by nobody.
 *
 * `deep` on the drag region means a drag starting anywhere on the bar moves the
 * window, *except* on a button: Tauri's handler stops at the first clickable
 * element it walks through. So the tabs stay clickable without each gap having
 * to be marked by hand.
 */
export function Titlebar({
  tabs,
  focus,
  settingsOpen,
  settingsDirty,
  controls,
  leadingInset,
  panelId,
  onFocus,
  onClose,
  onCloseSettings,
  onAct,
}: TitlebarProps): JSX.Element {
  const i18n = useTranslator();
  const activeId = focus?.kind === 'session' ? focus.sessionId : null;
  const settingsActive = focus?.kind === 'settings';

  /* Automatic activation, which is what a tab strip is expected to do: the
     arrow key both moves and switches. Focus follows, or the next arrow press
     would start over from wherever focus was left behind.

     The ring includes the settings tab, which is why this asks `focusAfter`
     rather than `tabAfter`: a tab the mouse can reach and the keyboard cannot
     is exactly the gap ADR-0005 took on when it took the chrome away from the
     platform. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : null;
    if (step === null) return;

    const next = focusAfter(tabs, settingsOpen, focus, step);
    if (next === null) return;

    event.preventDefault();
    onFocus(next);
    queueMicrotask(() => document.getElementById(elementId(next))?.focus());
  };

  return (
    <header
      data-tauri-drag-region="deep"
      className="bg-surface-chrome border-line-subtle flex h-9 shrink-0 items-stretch gap-2 border-b"
      style={{ paddingLeft: `${leadingInset}px` }}
    >
      <div className="flex shrink-0 items-center gap-2 pl-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          role="img"
          aria-label={i18n.t('app.name')}
        >
          <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.4" />
          <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.4" />
          <path
            d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
            className="stroke-brand-rune"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-ink text-[12.5px] font-semibold tracking-tight">
          {i18n.t('app.name')}
        </span>
      </div>

      {tabs.length === 0 && !settingsOpen ? (
        <span className="text-ink-faint self-center text-[11.5px]">{i18n.t('tabs.empty')}</span>
      ) : (
        <div
          role="tablist"
          aria-label={i18n.t('tabs.label')}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="flex min-w-0 items-stretch gap-0.5 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const active = tab.sessionId === activeId;

            return (
              <div
                key={tab.sessionId}
                role="presentation"
                className={`flex min-w-0 items-center gap-1.5 self-center rounded px-2 ${
                  active ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  id={tabId(tab.sessionId)}
                  aria-selected={active}
                  aria-controls={panelId}
                  /* Roving tabindex: one stop for the whole strip, and the
                     arrow keys move within it. */
                  tabIndex={active ? 0 : -1}
                  onClick={() => onFocus({ kind: 'session', sessionId: tab.sessionId })}
                  className={`flex h-6 min-w-0 items-center gap-2 text-[12px] ${
                    active ? 'text-ink' : 'text-ink-secondary'
                  }`}
                >
                  <SessionMarker kind={tab.kind} />
                  <span className="max-w-[180px] truncate">{tab.title}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onClose(tab.sessionId)}
                  aria-label={i18n.t('tabs.close', { name: tab.title })}
                  title={i18n.t('tabs.close', { name: tab.title })}
                  className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded"
                >
                  <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
                    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              </div>
            );
          })}

          {settingsOpen && (
            /* Always last. Session tabs keep the sidebar's order at the front,
               so opening or closing settings never shifts one sideways under
               the pointer. */
            <div
              role="presentation"
              className={`flex shrink-0 items-center gap-1.5 self-center rounded px-2 ${
                settingsActive ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
              }`}
            >
              <button
                type="button"
                role="tab"
                id={SETTINGS_TAB_ID}
                aria-selected={settingsActive}
                aria-controls={panelId}
                tabIndex={settingsActive ? 0 : -1}
                onClick={() => onFocus({ kind: 'settings' })}
                className={`flex h-6 items-center gap-2 text-[12px] ${
                  settingsActive ? 'text-ink' : 'text-ink-secondary'
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6L3.3 3.3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{i18n.t('tabs.settings')}</span>

                {settingsDirty && (
                  /* A dot rather than an asterisk in the label: the label is
                     translated and an asterisk glued to it reads as part of
                     the word in some of them. The name is on the button for
                     anybody who is not looking at it. */
                  <span
                    aria-hidden="true"
                    className="bg-accent inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  />
                )}
              </button>

              <button
                type="button"
                onClick={onCloseSettings}
                aria-label={i18n.t(settingsDirty ? 'tabs.settings.unsaved' : 'tabs.settings.close')}
                title={i18n.t(settingsDirty ? 'tabs.settings.unsaved' : 'tabs.settings.close')}
                className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded"
              >
                <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
                  <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* The rest of the bar is drag surface, and the reason the controls sit
          flush against the trailing edge. */}
      <div className="min-w-0 flex-1" />

      <WindowControls controls={controls} onAct={onAct} />
    </header>
  );
}
