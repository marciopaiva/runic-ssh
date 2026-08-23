import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
  /** Reports the grid the remote pty was last told about. */
  readonly onSize: (size: TerminalSize | null) => void;
}

/**
 * The terminal surface.
 *
 * Presentational: a container to mount into and whatever the session has to
 * say about itself. Everything that moves lives in the feature slice.
 */
export function TerminalView({ handle, onSize }: TerminalViewProps): JSX.Element {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { exitStatus, size } = useTerminal(container, handle);

  /* Reported upward rather than read downward: the status bar is a sibling,
     and lifting the size is cheaper than teaching it to find the terminal. */
  useEffect(() => {
    onSize(size);
  }, [onSize, size]);

  return (
    <section className="bg-surface-terminal flex h-full flex-col">
      <div ref={setContainer} className="min-h-0 flex-1 p-2" />

      {exitStatus !== null && (
        <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
          session ended · exit {exitStatus}
        </p>
      )}
    </section>
  );
}
