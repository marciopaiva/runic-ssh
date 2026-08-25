import type { JSX, ReactNode } from 'react';

import { useTranslator } from '../features/settings';

interface RailSlotProps {
  /** Whether the thing this slot leads to is what the sidebar is showing. */
  readonly on: boolean;
  readonly label: string;
  readonly badge?: number;
  readonly badgeLabel?: string;
  /** Held shut while typing reaches several hosts, with the reason on it. */
  readonly locked?: boolean;
  /** The lit colour. Warn while a broadcast is armed, so the rail says so too. */
  readonly tone?: 'accent' | 'warn';
  readonly onClick: () => void;
  readonly children: ReactNode;
}

/**
 * One icon in the rail.
 *
 * The lit state is a bar down the leading edge as well as a brighter icon,
 * because rule 5 of ADR-0020 asks for a shape before a colour and "slightly
 * lighter grey" is not a shape.
 */
function RailSlot({
  on,
  label,
  badge,
  badgeLabel,
  locked = false,
  tone = 'accent',
  onClick,
  children,
}: RailSlotProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`relative flex h-11 w-full items-center justify-center ${
        locked
          ? 'text-ink-disabled cursor-not-allowed'
          : on
            ? 'text-ink'
            : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      {on && (
        <span
          aria-hidden="true"
          className={`absolute top-2 bottom-2 left-0 w-0.5 rounded-r-sm ${
            tone === 'warn' ? 'bg-warn' : 'bg-accent'
          }`}
        />
      )}

      {children}

      {badge !== undefined && badge > 0 && (
        <span
          aria-label={badgeLabel}
          className={`text-surface-base absolute right-1.5 bottom-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-lg px-1 font-mono text-[9.5px] font-bold ${
            tone === 'warn' ? 'bg-warn' : 'bg-accent'
          }`}
        >
          {badge}
        </span>
      )}

      {locked && (
        /* A padlock rather than a dimmer icon. Disabled and dim is what a
           control looks like when the application forgot to wire it; a lock
           says something is holding it shut, and the label says what. */
        <svg
          viewBox="0 0 24 24"
          className="text-warn absolute right-1.5 bottom-1.5 h-2.5 w-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="9.5" rx="1.6" />
          <path d="M8 11V7.6a4 4 0 018 0V11" />
        </svg>
      )}
    </button>
  );
}

interface ActivityRailProps {
  /** Whether the session list is showing beside the rail. */
  readonly sidebarOpen: boolean;
  /** Whether what is typed reaches more than the host being looked at. */
  readonly armed: boolean;
  /** How many sessions are open, drawn on the sessions icon. */
  readonly openCount: number;
  /** Whether the settings tab exists somewhere in the window. */
  readonly settingsOpen: boolean;
  readonly onToggleSidebar: () => void;
  readonly onOpenSettings: () => void;
}

/**
 * The column of activities down the leading edge.
 *
 * ADR-0020 rule 4: the sidebar closes and this does not. That is the whole
 * reason it costs 48px on every screen forever. The icon that closed the
 * sidebar is the way back to it, so there is no state the window can get into
 * where the session list is gone and nothing on screen offers it.
 *
 * There is one view here and not three. SFTP has no code behind it yet (#127),
 * and an icon that switches to nothing is exactly the interface rule 6 refuses.
 * It arrives with the feature. The gear is an action rather than a view: it
 * opens the settings tab, takes no selection marker, and leaves the sidebar
 * alone.
 */
export function ActivityRail({
  sidebarOpen,
  armed,
  openCount,
  settingsOpen,
  onToggleSidebar,
  onOpenSettings,
}: ActivityRailProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <nav
      aria-label={i18n.t('rail.label')}
      className="bg-surface-chrome border-line-subtle flex w-12 shrink-0 flex-col items-center border-r py-1.5"
    >
      {/* Still live while armed. ADR-0020 is explicit that the sidebar may be
          closed with a broadcast on: every receiving host has a tab naming it,
          so the markers survive, and the list answers a second question rather
          than being required. */}
      <RailSlot
        on={sidebarOpen}
        tone={armed ? 'warn' : 'accent'}
        label={i18n.t(sidebarOpen ? 'rail.sessions.hide' : 'rail.sessions.show')}
        badge={openCount}
        badgeLabel={i18n.t('rail.sessions.open', { count: String(openCount) })}
        onClick={onToggleSidebar}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[21px] w-[21px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 17l5-5-5-5M12 19h8" />
        </svg>
      </RailSlot>

      <div className="flex-1" />

      {/* Held shut while armed. Opening settings puts a tab in a group, which
          changes what that group is showing, which changes which hosts receive
          what you type. `paneKey` in the shell notices and disarms, so nothing
          is sent anywhere unannounced either way; the lock is so that reaching
          for the gear does not silently cost the arming. */}
      <RailSlot
        on={settingsOpen}
        tone={armed ? 'warn' : 'accent'}
        locked={armed}
        label={i18n.t(armed ? 'rail.settings.locked' : 'rail.settings')}
        onClick={onOpenSettings}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[21px] w-[21px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3.1" />
          <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6" />
        </svg>
      </RailSlot>
    </nav>
  );
}
