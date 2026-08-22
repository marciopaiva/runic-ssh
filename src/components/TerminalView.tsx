import { useState } from 'react';
import type { JSX } from 'react';

import type { SessionHandle } from '../ipc';
import { useTerminal } from '../features/terminal/use-terminal';

interface TerminalViewProps {
  readonly handle: SessionHandle | null;
}

/**
 * The terminal surface.
 *
 * Presentational: a container to mount into and whatever the session has to
 * say about itself. Everything that moves lives in the feature slice.
 */
export function TerminalView({ handle }: TerminalViewProps): JSX.Element {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { renderer, fallbackReason, exitStatus } = useTerminal(container, handle);

  return (
    <section className="bg-surface-terminal flex h-full flex-col">
      <div ref={setContainer} className="min-h-0 flex-1 p-2" />

      {fallbackReason !== null && (
        <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 text-xs">
          {fallbackReason}
        </p>
      )}

      {exitStatus !== null && (
        <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
          session ended · exit {exitStatus}
        </p>
      )}

      {renderer !== null && (
        <span className="sr-only" data-testid="renderer">
          {renderer}
        </span>
      )}
    </section>
  );
}
