import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
  /** Whether this session's tab is the active one. */
  readonly visible: boolean;
  /** Reports the grid the remote pty was last told about. */
  readonly onSize: (size: TerminalSize | null) => void;
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
export function TerminalView({ handle, visible, onSize }: TerminalViewProps): JSX.Element {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { exitStatus, size } = useTerminal(container, handle);

  /* Reported upward rather than read downward: the status bar is a sibling,
     and lifting the size is cheaper than teaching it to find the terminal.
     Only the visible one reports — otherwise the bar would show whichever
     background session last resized. */
  useEffect(() => {
    if (visible) onSize(size);
  }, [onSize, size, visible]);

  return (
    <section
      className={`bg-surface-terminal absolute inset-0 flex flex-col ${
        visible ? '' : 'invisible pointer-events-none'
      }`}
      aria-hidden={visible ? undefined : true}
    >
      <div ref={setContainer} className="min-h-0 flex-1 p-2" />

      {exitStatus !== null && (
        <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
          session ended · exit {exitStatus}
        </p>
      )}
    </section>
  );
}
