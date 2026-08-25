import type { JSX, ReactNode } from 'react';

import { useTranslator } from '../features/settings';

interface RailSlotProps {
  /** Whether the thing this slot leads to is what the sidebar is showing. */
  readonly on: boolean;
  readonly label: string;
  readonly badge?: number;
  readonly badgeLabel?: string;
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
function RailSlot({ on, label, badge, badgeLabel, onClick, children }: RailSlotProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`relative flex h-11 w-full items-center justify-center ${
        on ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      {on && (
        <span
          aria-hidden="true"
          className="bg-accent absolute top-2 bottom-2 left-0 w-0.5 rounded-r-sm"
        />
      )}

      {children}

      {badge !== undefined && badge > 0 && (
        <span
          aria-label={badgeLabel}
          className="bg-accent text-surface-base absolute right-1.5 bottom-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-lg px-1 font-mono text-[9.5px] font-bold"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

interface ActivityRailProps {
  /** Whether the session list is showing beside the rail. */
  readonly sidebarOpen: boolean;
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
      <RailSlot
        on={sidebarOpen}
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

      <RailSlot
        on={settingsOpen}
        label={i18n.t('rail.settings')}
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
