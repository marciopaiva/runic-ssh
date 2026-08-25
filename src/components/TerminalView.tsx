import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';
import { useTranslator } from '../features/settings';

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
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
  /** Which key means the clipboard on this platform. */
  readonly modifier: 'meta' | 'control';
  /** Raised for a paste the remote shell would run a line at a time. */
  readonly onPasteNeedsConfirming: (text: string) => void;
  /** Where a keystroke goes. Decided by the shell, not by this terminal. */
  readonly onInput: (bytes: Uint8Array) => void;
  /** Whether what is typed here reaches more than this session. */
  readonly broadcasting: boolean;
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
  visible,
  focused,
  frame,
  id,
  labelledBy,
  onPaneFocus,
  onSize,
  modifier,
  onPasteNeedsConfirming,
  onInput,
  broadcasting,
}: TerminalViewProps): JSX.Element {
  const i18n = useTranslator();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { exitStatus, size } = useTerminal(
    container,
    handle,
    modifier,
    onPasteNeedsConfirming,
    onInput,
    broadcasting,
  );

  /* Reported upward rather than read downward: the status bar is a sibling,
     and lifting the size is cheaper than teaching it to find the terminal.
     Only the focused one reports. With several panes on screen the bar would
     otherwise show whichever of them resized last. */
  useEffect(() => {
    if (focused) onSize(size);
  }, [onSize, size, focused]);

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
    >
      {/* The padding is on this wrapper and not on the element xterm owns.
          FitAddon measures the parent it is opened into, and the rows it
          derives from that measurement are laid out over the padding rather
          than inside it — so a padded container reads as breathing room and
          renders as a clipped last line. */}
      <div className="min-h-0 flex-1 p-2">
        <div ref={setContainer} className="h-full w-full" />
      </div>

      {exitStatus !== null && (
        <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
          {i18n.t('terminal.ended', { status: String(exitStatus) })}
        </p>
      )}
    </section>
  );
}
