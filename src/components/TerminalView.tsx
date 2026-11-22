import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX, MouseEvent as ReactMouseEvent } from 'react';

import type { Session, SessionHandle, ShellSlot } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { ClipboardApi } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';
import { useTranslator } from '../features/settings';
import { MAX_ATTEMPTS } from '../features/sessions/reconnect';
import type { ReconnectView } from '../features/sessions/reconnect';

import { Button } from './ui/Button';
import { Card } from './ui/Card';

export interface TerminalViewProps {
  readonly handle: SessionHandle | null;
  /** Which of the connection's (at most two) shells this terminal is wired
      to. ADR-0077. Defaults to the primary, which is every caller from
      before that ADR. */
  readonly slot?: ShellSlot | undefined;
  /** For the ADR-0051 MOTD banner: the session this terminal belongs to
      (`null` if it no longer exists in the saved list), and the full saved
      list, for naming a jump host it rides. */
  readonly session: Session | null;
  readonly sessions: readonly Session[];
  /** Whether this session is the active tab of a group. */
  readonly visible: boolean;
  /** Whether this is the pane the keyboard and the status bar belong to. */
  readonly focused: boolean;
  /**
   * Where to draw, decided by the shell.
   *
   * A rectangle rather than a class because it is a percentage of the main
   * area with the group's strip and border taken off it, and there is no
   * utility for "half of whatever this panel is, less 30 pixels".
   */
  readonly frame: CSSProperties;
  /** This surface's own id, which its tab points `aria-controls` at. */
  readonly id: string;
  /** The tab that names it. */
  readonly labelledBy: string;
  /** Raised when the pointer or the keyboard lands inside this pane. */
  readonly onPaneFocus: () => void;
  /** Reports the grid the remote pty was last told about. */
  readonly onSize: (size: TerminalSize | null) => void;
  /** Reports this pane's own focus function, so a caller elsewhere (running
      a macro from the sidebar, say) can hand the keyboard back to it. */
  readonly onFocusHandle: (focus: () => void) => void;
  /** Which key means the clipboard on this platform. */
  readonly modifier: 'meta' | 'control';
  /** Raised for a paste the remote shell would run a line at a time. */
  readonly onPasteNeedsConfirming: (text: string) => void;
  /** Where a keystroke goes. Decided by the shell, not by this terminal. */
  readonly onInput: (bytes: Uint8Array) => void;
  /** Whether what is typed here reaches more than this session. */
  readonly broadcasting: boolean;
  /** Reports the clipboard, for a menu drawn by whoever mounts this (#115). */
  readonly onClipboardHandle?: ((clipboard: ClipboardApi) => void) | undefined;
  /** The right button over the terminal. Absent, the webview draws its own
      menu, which is what Sessions still gets until v0.9.0. */
  readonly onContextMenu?: ((event: ReactMouseEvent) => void) | undefined;
  /** Raised once when the connection under this terminal is lost (ADR-0079). */
  readonly onConnectionLost?: (() => void) | undefined;
  /** Where the retries of a lost connection are, when there are any. */
  readonly reconnect?: ReconnectView | null | undefined;
  /** The banner's button: reconnect now. */
  readonly onReconnect?: (() => void) | undefined;
  /** The banner's cancel, while the retries are running. */
  readonly onCancelReconnect?: (() => void) | undefined;
}

/**
 * The terminal surface.
 *
 * Presentational: a container to mount into and whatever the session has to
 * say about itself. Everything that moves lives in the feature slice.
 *
 * One of these stays mounted per connected session (ADR-0014), so most of them
 * are on screen without being visible. They are hidden with `visibility`
 * rather than `display`, and that is load-bearing rather than cosmetic: a
 * `display: none` element measures zero, which would have `FitAddon` compute a
 * garbage grid and the `ResizeObserver` tell the remote pty it is `0x0`. A
 * hidden terminal keeps its real dimensions, so a window resize reaches every
 * session and not only the one being looked at.
 *
 * That is also why a hidden terminal is handed the whole area as its frame and
 * not the group it last sat in: it goes on measuring something real, and it is
 * given its rectangle on the way back in.
 *
 * It draws no header of its own. ADR-0020 gave that job to the group's strip.
 * The strip and the header were two objects answering one question, which
 * session is this rectangle, and nothing failed when they disagreed. A
 * terminal is a mounted body and nothing else, which is also what lets it move
 * between groups without being remounted.
 */
export function TerminalView({
  handle,
  slot,
  session,
  sessions,
  visible,
  focused,
  frame,
  id,
  labelledBy,
  onPaneFocus,
  onSize,
  onFocusHandle,
  modifier,
  onPasteNeedsConfirming,
  onInput,
  broadcasting,
  onClipboardHandle,
  onContextMenu,
  onConnectionLost,
  reconnect = null,
  onReconnect,
  onCancelReconnect,
}: TerminalViewProps): JSX.Element {
  const i18n = useTranslator();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { closed, exitStatus, connectionLost, size, focus, clipboard } = useTerminal(
    container,
    handle,
    modifier,
    onPasteNeedsConfirming,
    onInput,
    broadcasting,
    session,
    sessions,
    slot ?? 'primary',
  );

  /* Reported upward rather than read downward: the status bar is a sibling,
     and lifting the size is cheaper than teaching it to find the terminal.
     Only the focused one reports. With several panes on screen the bar would
     otherwise show whichever of them resized last. */
  useEffect(() => {
    if (focused) onSize(size);
  }, [onSize, size, focused]);

  /* Told once per drop, to whoever owns the retries. Only the primary shell:
     a second one closing is not the connection going. */
  const lostRef = useRef(onConnectionLost);
  lostRef.current = onConnectionLost;
  useEffect(() => {
    if (connectionLost && (slot ?? 'primary') === 'primary') lostRef.current?.();
  }, [connectionLost, slot]);

  useEffect(() => {
    onFocusHandle(focus);
  }, [onFocusHandle, focus]);

  useEffect(() => {
    onClipboardHandle?.(clipboard);
  }, [onClipboardHandle, clipboard]);

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={`bg-surface-terminal absolute flex flex-col overflow-hidden ${
        visible ? '' : 'invisible pointer-events-none'
      }`}
      style={frame}
      aria-hidden={visible ? undefined : true}
      /* React's `onFocus` is `focusin`, so this catches the click that lands
         inside xterm as well as a tab into it. */
      onFocus={onPaneFocus}
      onContextMenu={onContextMenu}
    >
      {/* The padding is on this wrapper and not on the element xterm owns.
          FitAddon measures the parent it is opened into, and the rows it
          derives from that measurement are laid out over the padding rather
          than inside it — so a padded container reads as breathing room and
          renders as a clipped last line. */}
      <div className="min-h-0 flex-1 p-2">
        <div ref={setContainer} className="h-full w-full" />
      </div>

      {(connectionLost || reconnect !== null) && (
        <Card variant="filled" padding="sm" className="border-t border-line-subtle">
          <div className="border-line-subtle flex items-center gap-2 border-t px-3 py-1.5 text-xs" role="status">
            <p className="text-ink-muted flex-1 font-mono">
              {reconnect === null
                ? i18n.t('terminal.reconnect.lost')
                : reconnect.phase === 'stopped'
                  ? i18n.t(`terminal.reconnect.stopped.${reconnect.reason}`, { max: String(MAX_ATTEMPTS) })
                  : i18n.t('terminal.reconnect.trying', {
                      attempt: String(reconnect.attempt),
                      max: String(MAX_ATTEMPTS),
                    })}
            </p>
            {reconnect !== null && reconnect.phase !== 'stopped' && onCancelReconnect !== undefined && (
              <Button variant="ghost" size="sm" onClick={onCancelReconnect}>
                {i18n.t('terminal.reconnect.cancel')}
              </Button>
            )}
            {(reconnect === null || reconnect.phase === 'stopped') && onReconnect !== undefined && (
              <Button variant="ghost" size="sm" onClick={onReconnect}>
                {i18n.t('terminal.reconnect.now')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {closed && !connectionLost && (
        <Card variant="filled" padding="sm" className="border-t border-line-subtle">
          <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
            {exitStatus === null
              ? i18n.t('terminal.endedUnknown')
              : i18n.t('terminal.ended', { status: String(exitStatus) })}
          </p>
        </Card>
      )}
    </section>
  );
}