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

import { keyIntent, pasteNeedsConfirming } from './clipboard';
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
  modifier: 'meta' | 'control',
  onPasteNeedsConfirming: (text: string) => void,
): TerminalState {
  const [state, setState] = useState<TerminalState>({
    exitStatus: null,
    size: null,
  });

  /* Held in a ref rather than state: writing output must not re-render. */
  const writeRef = useRef<((bytes: Uint8Array) => void) | null>(null);

  /* Also a ref, for a different reason: the effect below mounts an xterm, and
     it must not tear one down and build another because a parent re-rendered
     and handed us a new closure. */
  const confirmRef = useRef(onPasteNeedsConfirming);
  confirmRef.current = onPasteNeedsConfirming;

  const modifierRef = useRef(modifier);
  modifierRef.current = modifier;

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

      /* Ctrl-C is the keystroke this has to be careful with. Returning `false`
         makes xterm return from its key handler before it calls
         `preventDefault`, so the browser goes on to raise the ordinary `copy`
         or `paste` event and the handlers xterm already registers do the work.
         Nothing here reads the clipboard, which is why none of it needs a
         permission the webview would then hold permanently. */
      terminal.attachCustomKeyEventHandler((event) => {
        const intent = keyIntent(event, terminal.hasSelection(), modifierRef.current);
        return intent === 'send';
      });

      /* Drop the selection once it has been copied, so the next Ctrl-C is an
         interrupt again. Registered on the container, which sees the event
         bubble up after xterm's own handler has filled the clipboard. */
      const copied = (): void => terminal.clearSelection();
      container.addEventListener('copy', copied);

      /* Ask before a multi-line paste the remote shell has not bracketed, since
         that shell runs each line as it arrives. Capturing on the container
         puts this ahead of the listeners xterm puts on its own elements, which
         is the only place the text can still be stopped. */
      const pasting = (event: ClipboardEvent): void => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!pasteNeedsConfirming(text, terminal.modes.bracketedPasteMode)) return;

        event.preventDefault();
        event.stopPropagation();
        confirmRef.current(text);
      };
      container.addEventListener('paste', pasting, true);

      const encoder = new TextEncoder();
      const typed = terminal.onData((data) => {
        /* Typing anything ends the selection, so a selection left on screen
           costs at most one Ctrl-C. Done here rather than in the key handler
           because that one also sees the `keydown` for Ctrl itself, and
           clearing there would erase the selection a moment before the C
           arrived to copy it. */
        terminal.clearSelection();
        /* Rejections are caught and dropped on purpose. The input is split to
           stay inside what the core accepts, so what is left is a session that
           has ended, and `onClosed` already says so. A banner per keystroke
           after that would bury it. */
        void sendInput(handle, encoder.encode(data)).catch(() => {});
      });
      /* Paste and anything else that arrives as bytes rather than text. */
      const binary = terminal.onBinary((data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
        void sendInput(handle, bytes).catch(() => {});
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
        () => container.removeEventListener('copy', copied),
        () => container.removeEventListener('paste', pasting, true),
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
