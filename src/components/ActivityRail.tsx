import type { JSX, ReactNode } from 'react';

import { useTranslator } from '../features/settings';
import { Button } from './ui/Button';
import { cn } from '../lib/classnames';
import { HomeIcon, LockIcon, MapIcon } from './ui/icons';

interface RailSlotProps {
  /** Whether the thing this slot leads to is what the sidebar is showing. */
  readonly on: boolean;
  readonly label: string;
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
function RailSlot({ on, label, locked = false, tone = 'accent', onClick, children }: RailSlotProps): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={locked}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex h-11 w-full items-center justify-center',
        'transition-colors duration-fast easing-standard',
        locked
          ? 'text-ink-disabled cursor-not-allowed'
          : on
            ? 'text-ink'
            : 'text-ink-faint hover:text-ink-muted',
      )}
    >
      {on && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-2 bottom-2 left-0 w-0.5 rounded-r-sm',
            tone === 'warn' ? 'bg-warn' : 'bg-accent',
          )}
        />
      )}

      {children}

      {locked && (
        /* A padlock rather than a dimmer icon. Disabled and dim is what a
           control looks like when the application forgot to wire it; a lock
           says something is holding it shut, and the label says what. */
        <LockIcon className="text-warn absolute right-1.5 bottom-1.5 h-2.5 w-2.5" />
      )}
    </Button>
  );
}

/** Which main area the window is showing. */
export type Workspace = 'home' | 'sessions' | 'sftp' | 'map';

interface ActivityRailProps {
  /** Which workspace is showing right now: `home` or `map`, the only two
      slots this rail still draws (ADR-0072). */
  readonly workspace: Workspace;
  /** Whether the sessions sidebar is beside the rail, while Home is active. */
  readonly sidebarOpen: boolean;
  /** Whether what is typed reaches more than the host being looked at. */
  readonly armed: boolean;
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
 * The column of activities down the leading edge of the map shell.
 *
 * ADR-0072 retired this rail from the classic shell: Sessions and SFTP moved
 * into the toolbar's own pill switch, and Home folded into the "+" palette
 * beside it. The map shell keeps its own two slots, Home and Map, exactly as
 * ADR-0069 drew them; the classic shell no longer mounts this component at
 * all.
 *
 * ADR-0020 rule 4: the sidebar closes and this does not. That is the whole
 * reason it costs 48px on every screen forever. The icon that closed the
 * sidebar is the way back to it, so there is no state the window can get into
 * where the session list is gone and nothing on screen offers it.
 */
export function ActivityRail({ workspace, sidebarOpen, armed, onChoose }: ActivityRailProps): JSX.Element {
  const i18n = useTranslator();

  const home = (
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
      <HomeIcon className="h-[21px] w-[21px]" />
    </RailSlot>
  );

  const map = (
    <RailSlot on={workspace === 'map'} tone={armed ? 'warn' : 'accent'} label={i18n.t('map.rail')} onClick={() => onChoose('map')}>
      <MapIcon className="h-[21px] w-[21px]" />
    </RailSlot>
  );

  /* ADR-0069: the rail ADR-0064 always planned for after the cut, reached
     without one. Home stays the host book here, unchanged by ADR-0072,
     which only touched the classic shell. */
  return (
    <nav
      aria-label={i18n.t('rail.label')}
      className="bg-surface-chrome border-line-subtle flex w-12 shrink-0 flex-col items-center border-r py-1.5"
    >
      {home}
      {map}
      <div className="flex-1" />
    </nav>
  );
}
