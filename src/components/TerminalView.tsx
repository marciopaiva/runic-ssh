import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';
import { useTranslator } from '../features/settings';

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
  /** Whether this session's tab is the active one. */
  readonly visible: boolean;
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
 */
export function TerminalView({
  handle,
  visible,
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
     Only the visible one reports — otherwise the bar would show whichever
     background session last resized. */
  useEffect(() => {
    if (visible) onSize(size);
  }, [onSize, size, visible]);

  return (
    <section
      className={`bg-surface-terminal absolute inset-0 flex flex-col overflow-hidden ${
        visible ? '' : 'invisible pointer-events-none'
      }`}
      aria-hidden={visible ? undefined : true}
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
