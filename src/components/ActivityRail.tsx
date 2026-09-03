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

/** Which main area the window is showing. */
export type Workspace = 'home' | 'sessions' | 'sftp';

interface ActivityRailProps {
  /** Which workspace is showing right now. */
  readonly workspace: Workspace;
  /** Whether the sessions sidebar is beside the rail, while Sessions is active. */
  readonly sidebarOpen: boolean;
  /** Whether what is typed reaches more than the host being looked at. */
  readonly armed: boolean;
  /** How many sessions are open, drawn on the Sessions icon. */
  readonly openCount: number;
  /** How many sessions have an SFTP tab open, drawn on the SFTP icon. */
  readonly sftpCount: number;
  /**
   * Switches to a workspace, or toggles the sessions sidebar when that
   * workspace is already showing. One click target for both: a rail icon
   * that only ever switched a sidebar had nothing left to do once it was
   * already where it pointed, and that is exactly the moment "show or hide
   * the list" becomes the useful question.
   */
  readonly onChoose: (workspace: Workspace) => void;
}

/**
 * The column of activities down the leading edge.
 *
 * ADR-0020 rule 4: the sidebar closes and this does not. That is the whole
 * reason it costs 48px on every screen forever. The icon that closed the
 * sidebar is the way back to it, so there is no state the window can get into
 * where the session list is gone and nothing on screen offers it.
 *
 * Three views now (ADR-0044): Home, Sessions and SFTP, each a real
 * destination rather than one view and an action wedged into its rail slot.
 * SFTP held out until #127 shipped, per rule 6: an icon that switches to
 * nothing is exactly what that rule refuses.
 */
export function ActivityRail({
  workspace,
  sidebarOpen,
  armed,
  openCount,
  sftpCount,
  onChoose,
}: ActivityRailProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <nav
      aria-label={i18n.t('rail.label')}
      className="bg-surface-chrome border-line-subtle flex w-12 shrink-0 flex-col items-center border-r py-1.5"
    >
      {/* Held shut while armed, the way the gear used to be: switching away is
          not what somebody reaching for it mid-broadcast meant to do. */}
      <RailSlot
        on={workspace === 'home'}
        tone={armed ? 'warn' : 'accent'}
        locked={armed}
        label={i18n.t(
          armed
            ? 'rail.home.locked'
            : workspace === 'home'
              ? sidebarOpen
                ? 'rail.home.hide'
                : 'rail.home.show'
              : 'rail.home',
        )}
        onClick={() => onChoose('home')}
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
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </RailSlot>

      {/* Still live while armed. ADR-0020 is explicit that the sidebar may be
          closed with a broadcast on: every receiving host has a tab naming it,
          so the markers survive, and the list answers a second question rather
          than being required. */}
      <RailSlot
        on={workspace === 'sessions'}
        tone={armed ? 'warn' : 'accent'}
        label={i18n.t(
          workspace === 'sessions'
            ? sidebarOpen
              ? 'rail.sessions.hide'
              : 'rail.sessions.show'
            : 'rail.sessions',
        )}
        badge={openCount}
        badgeLabel={i18n.t('rail.sessions.open', { count: String(openCount) })}
        onClick={() => onChoose('sessions')}
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

      {/* ADR-0044: SFTP's own workspace, held shut while armed for the same
          reason Home is: browsing away is not what someone reaching for the
          rail mid-broadcast meant to do, and nothing here has a keystroke to
          receive regardless. */}
      <RailSlot
        on={workspace === 'sftp'}
        tone={armed ? 'warn' : 'accent'}
        locked={armed}
        label={i18n.t(
          armed
            ? 'rail.sftp.locked'
            : workspace === 'sftp'
              ? sidebarOpen
                ? 'rail.sftp.hide'
                : 'rail.sftp.show'
              : 'rail.sftp',
        )}
        badge={sftpCount}
        badgeLabel={i18n.t('rail.sftp.open', { count: String(sftpCount) })}
        onClick={() => onChoose('sftp')}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[21px] w-[21px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6.5h6l1.6 2H20v9.5H4z" />
        </svg>
      </RailSlot>

      <div className="flex-1" />
    </nav>
  );
}
