/**
 * Wiring one `xterm.js` instance to one session.
 *
 * State and effects live here rather than in a component, per section 6. The
 * component below is a div and a ref.
 */

import { useEffect, useRef, useState } from 'react';

import {
  onClosed,
  onOutput,
  openTerminal,
  resizeTerminal,
  sendInput,
} from '../../ipc';
import type { SessionHandle } from '../../ipc';

import { terminalTheme } from './theme';

/** The grid the remote pty is drawing on. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export interface TerminalState {
  /** The remote shell's exit status, once it has one. */
  readonly exitStatus: number | null;
  /**
   * What the pty was last told, or `null` before a terminal is mounted.
   *
   * Reported from the same place the resize is sent, so the status bar cannot
   * show a size the remote end was never given.
   */
  readonly size: TerminalSize | null;
}

/**
 * Mounts a terminal into `container` and keeps it fed.
 *
 * Everything is torn down on unmount: the addons, the event listeners and the
 * resize observer. A closed tab that leaves a listener behind keeps decoding
 * output nobody can see.
 */
export function useTerminal(
  container: HTMLDivElement | null,
  handle: SessionHandle | null,
): TerminalState {
  const [state, setState] = useState<TerminalState>({
    exitStatus: null,
    size: null,
  });

  /* Held in a ref rather than state: writing output must not re-render. */
  const writeRef = useRef<((bytes: Uint8Array) => void) | null>(null);

  useEffect(() => {
    if (container === null || handle === null) return;

    let disposed = false;
    const teardown: Array<() => void> = [];

    const start = async (): Promise<void> => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (disposed) return;

      const terminal = new Terminal({
        theme: terminalTheme(),
        fontFamily: "'JetBrains Mono', 'Cascadia Mono', ui-monospace, monospace",
        fontSize: 13,
        lineHeight: 1.35,
        cursorBlink: true,
        /* Enough history to scroll back through a build, bounded so a hostile
           host cannot grow it without limit. */
        scrollback: 5000,
        /* Left at the default. Nothing here uses a proposed API, and neither
           addon references one — an earlier version enabled it out of habit,
           which is how experimental surface ends up switched on in an
           application that never asked for it. */
        allowProposedApi: false,
      });

      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(container);

      if (disposed) {
        terminal.dispose();
        return;
      }

      fit.fit();
      setState((current) => ({
        ...current,
        size: { columns: terminal.cols, rows: terminal.rows },
      }));

      writeRef.current = (bytes) => terminal.write(bytes);

      /* The palette follows the theme while the session is open. Reading it
         once at construction would leave the terminal — the surface a user
         stares at longest — as the one place that keeps the old colours after
         a theme change, which is precisely what the token system exists to
         avoid. */
      const repaint = (): void => {
        terminal.options.theme = terminalTheme();
      };

      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
      systemTheme.addEventListener('change', repaint);

      /* An explicit choice in settings stamps the root element, which no media
         query reports. */
      const themeAttribute = new MutationObserver(repaint);
      themeAttribute.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });

      await openTerminal(handle, terminal.cols, terminal.rows);

      const stopOutput = await onOutput(handle, (bytes) => {
        writeRef.current?.(bytes);
      });
      const stopClosed = await onClosed(handle, (exitStatus) => {
        setState((current) => ({ ...current, exitStatus }));
      });

      const encoder = new TextEncoder();
      const typed = terminal.onData((data) => {
        void sendInput(handle, encoder.encode(data));
      });
      /* Paste and anything else that arrives as bytes rather than text. */
      const binary = terminal.onBinary((data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
        void sendInput(handle, bytes);
      });

      /* The remote pty has to be told, or every program that draws by column
         count keeps drawing at the old width. */
      const observer = new ResizeObserver(() => {
        fit.fit();
        void resizeTerminal(handle, terminal.cols, terminal.rows);
        setState((current) => ({
          ...current,
          size: { columns: terminal.cols, rows: terminal.rows },
        }));
      });
      observer.observe(container);

      teardown.push(
        () => systemTheme.removeEventListener('change', repaint),
        () => themeAttribute.disconnect(),
        () => observer.disconnect(),
        () => typed.dispose(),
        () => binary.dispose(),
        stopOutput,
        stopClosed,
        () => terminal.dispose(),
      );
    };

    void start();

    return () => {
      disposed = true;
      writeRef.current = null;
      for (const stop of teardown.reverse()) stop();
    };
  }, [container, handle]);

  return state;
}
