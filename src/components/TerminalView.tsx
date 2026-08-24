import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';
import type { Box } from '../features/terminal';
import { useTranslator } from '../features/settings';

/**
 * What the edge of a pane says about it.
 *
 * `none` is a panel with one terminal in it, drawn exactly as it was before
 * there were panes. `synced` is the loud one, and it is a safety marker rather
 * than decoration: it is the only thing on screen saying that what you type
 * reaches more than the host you are looking at.
 */
export type PaneEdge = 'none' | 'idle' | 'focused' | 'synced';

const EDGES: Readonly<Record<PaneEdge, string>> = {
  none: '',
  idle: 'border-2 border-line-subtle',
  focused: 'border-2 border-accent',
  synced: 'border-2 border-warn',
};

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
  /** Whether this session is in a pane at all. */
  readonly visible: boolean;
  /** Whether this is the pane the keyboard and the status bar belong to. */
  readonly focused: boolean;
  /** The rectangle of the panel this pane occupies. */
  readonly box: Box;
  readonly edge: PaneEdge;
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
 * That is also why a hidden terminal is handed the whole panel as its box and
 * not the pane it last sat in: it goes on measuring something real, and it is
 * given its rectangle on the way back in.
 */
export function TerminalView({
  handle,
  visible,
  focused,
  box,
  edge,
  onPaneFocus,
  onSize,
  modifier,
  onPasteNeedsConfirming,
  onInput,
}: TerminalViewProps): JSX.Element {
  const i18n = useTranslator();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { exitStatus, size } = useTerminal(
    container,
    handle,
    modifier,
    onPasteNeedsConfirming,
    onInput,
  );

  /* Reported upward rather than read downward: the status bar is a sibling,
     and lifting the size is cheaper than teaching it to find the terminal.
     Only the focused one reports — with several panes on screen the bar would
     otherwise show whichever of them resized last. */
  useEffect(() => {
    if (focused) onSize(size);
  }, [onSize, size, focused]);

  return (
    <section
      className={`bg-surface-terminal absolute flex flex-col overflow-hidden ${
        EDGES[edge]
      } ${visible ? '' : 'invisible pointer-events-none'}`}
      /* Inline because the rectangle is a percentage that changes with the
         layout, and there is no class for "half of whatever this panel is". */
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      }}
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
