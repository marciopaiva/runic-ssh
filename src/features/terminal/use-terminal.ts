/**
 * Wiring one `xterm.js` instance to one session.
 *
 * State and effects live here rather than in a component, per section 6. The
 * component below is a div and a ref.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

import { openTerminal, resizeTerminal, watchTerminal } from '../../ipc';
import type { Session, SessionHandle, ShellSlot } from '../../ipc';
import { useTranslator } from '../settings';

import { forgetTerminalCwd, parseOsc7, reportTerminalCwd } from './cwd';
import { keyIntent, pasteNeedsConfirming } from './clipboard';
import { motdBanner } from './motd';
import { terminalTheme } from './theme';

/** The grid the remote pty is drawing on. */
export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * The clipboard, reached from a menu rather than a key (#115, ADR-0018's
 * follow-up). Both go through `document.execCommand`, which raises the
 * same `copy` and `paste` events a keystroke does, so xterm's own handlers
 * and the paste confirmation above run unchanged; nothing here reads or
 * writes the clipboard directly, and nothing asks for a permission. Each
 * returns what the browser said: `false` is a webview that refused, which
 * `docs/measurements/terminal-menu-clipboard.md` records per platform.
 */
export interface ClipboardApi {
  readonly hasSelection: () => boolean;
  readonly copy: () => boolean;
  readonly paste: () => boolean;
}

export interface TerminalState {
  /**
   * Whether the remote shell has closed.
   *
   * Separate from {@link TerminalState.exitStatus} on purpose: a server can
   * close the channel without ever sending an exit-status request first (the
   * fixture in `docs/testing.md` does, for a plain interactive `exit`), and
   * `exitStatus` then stays `null` exactly as it was before the shell ever
   * closed. Without this field, that close was indistinguishable from a
   * session still running: confirmed live (#281), typing `exit` left the tab
   * looking connected forever, with no banner and no error, because the only
   * signal a caller had was a value that meant both things at once.
   */
  readonly closed: boolean;
  /** The remote shell's exit status, once it has one. `null` both before the
      shell closes and after, if it closed without ever reporting one. */
  readonly exitStatus: number | null;
  /** The shell closed because the connection went away, not because it
      ended (ADR-0079). Cleared when a new handle opens a shell here. */
  readonly connectionLost: boolean;
  /**
   * What the pty was last told, or `null` before a terminal is mounted.
   *
   * Reported from the same place the resize is sent, so the status bar cannot
   * show a size the remote end was never given.
   */
  readonly size: TerminalSize | null;
  /** Moves the keyboard caret into this terminal. A no-op before the
      terminal has finished mounting, since nothing is there yet to catch it. */
  readonly focus: () => void;
  /** The clipboard from a menu; see {@link ClipboardApi}. */
  readonly clipboard: ClipboardApi;
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
  onInput: (bytes: Uint8Array) => void,
  broadcasting: boolean,
  /** `null` only if the session vanished from the saved list between
      connecting and this terminal mounting; the banner is skipped rather
      than printed with nothing to say. */
  session: Session | null,
  sessions: readonly Session[],
  /** Which of the connection's (at most two) shells this terminal is wired
      to. ADR-0077. Defaults to the primary, which is every caller from
      before that ADR. */
  slot: ShellSlot = 'primary',
): TerminalState {
  const i18n = useTranslator();
  const [state, setState] = useState<Omit<TerminalState, 'focus' | 'clipboard'>>({
    closed: false,
    exitStatus: null,
    connectionLost: false,
    size: null,
  });

  /* Held in a ref rather than state: writing output must not re-render. */
  const writeRef = useRef<((bytes: Uint8Array) => void) | null>(null);

  /* Also a ref: focusing must reach whatever xterm instance is live right
     now, not the one that existed when a caller first read this hook's
     return value. */
  const terminalRef = useRef<Terminal | null>(null);
  const focus = useCallback((): void => {
    terminalRef.current?.focus();
  }, []);
  const clipboard = useMemo<ClipboardApi>(
    () => ({
      hasSelection: () => terminalRef.current?.hasSelection() ?? false,
      copy: () => {
        const terminal = terminalRef.current;
        if (terminal === null || !terminal.hasSelection()) return false;
        terminal.focus();
        return document.execCommand('copy');
      },
      paste: () => {
        const terminal = terminalRef.current;
        if (terminal === null) return false;
        terminal.focus();
        return document.execCommand('paste');
      },
    }),
    [],
  );

  /* Also a ref, for a different reason: the effect below mounts an xterm, and
     it must not tear one down and build another because a parent re-rendered
     and handed us a new closure. */
  const confirmRef = useRef(onPasteNeedsConfirming);
  confirmRef.current = onPasteNeedsConfirming;

  const modifierRef = useRef(modifier);
  modifierRef.current = modifier;

  /* A ref for the third time, and here it is load-bearing rather than tidy.
     Where a keystroke goes is the shell's business, and the shell changes its
     mind whenever the panes or the sync switch change. As a dependency that
     would re-run the effect, dispose every xterm and have the core open a
     second shell to replace the one nobody was reading any more, which is
     defect #94 and the reason ADR-0014 exists. */
  const inputRef = useRef(onInput);
  inputRef.current = onInput;

  const broadcastingRef = useRef(broadcasting);
  broadcastingRef.current = broadcasting;

  /* The xterm outlives the handle (ADR-0079). It is built for a container and
     lives until that container goes, so a reconnect, which brings a new handle,
     keeps the scrollback. `bound` rather than `handle` is the dependency: a
     different number must not rebuild it, only the absence of one. */
  const bound = handle !== null;
  const handleRef = useRef(handle);
  handleRef.current = handle;
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  useEffect(() => {
    if (container === null || !bound) return;

    let disposed = false;
    const teardown: Array<() => void> = [];

    const start = async (): Promise<void> => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (disposed) return;

      const built = new Terminal({
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
      built.loadAddon(fit);
      built.open(container);

      if (disposed) {
        built.dispose();
        return;
      }

      fit.fit();
      setState((current) => ({
        ...current,
        size: { columns: built.cols, rows: built.rows },
      }));

      writeRef.current = (bytes) => built.write(bytes);
      terminalRef.current = built;

      /* ADR-0051: written before the shell opens, which is what a real remote
         MOTD would arrive through, so this can never race one. Read once, at
         connect: a MOTD already on screen keeps whatever language it was
         printed in, the same way a real server's own banner would not
         retroactively translate itself after the fact. */
      if (session !== null) {
        built.write(motdBanner(session, sessions, built.cols, i18n));
      }

      /* The palette follows the theme while the session is open. Reading it
         once at construction would leave the terminal — the surface a user
         stares at longest — as the one place that keeps the old colours after
         a theme change, which is precisely what the token system exists to
         avoid. */
      const repaint = (): void => {
        built.options.theme = terminalTheme();
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

      /* Ctrl-C is the keystroke this has to be careful with. Returning `false`
         makes xterm return from its key handler before it calls
         `preventDefault`, so the browser goes on to raise the ordinary `copy`
         or `paste` event and the handlers xterm already registers do the work.
         Nothing here reads the clipboard, which is why none of it needs a
         permission the webview would then hold permanently. */
      built.attachCustomKeyEventHandler((event) => {
        const intent = keyIntent(event, built.hasSelection(), modifierRef.current);
        return intent === 'send';
      });

      /* Drop the selection once it has been copied, so the next Ctrl-C is an
         interrupt again. Registered on the container, which sees the event
         bubble up after xterm's own handler has filled the clipboard. */
      const copied = (): void => built.clearSelection();
      container.addEventListener('copy', copied);

      /* Ask before a multi-line paste the remote shell has not bracketed, since
         that shell runs each line as it arrives. Capturing on the container
         puts this ahead of the listeners xterm puts on its own elements, which
         is the only place the text can still be stopped. */
      const pasting = (event: ClipboardEvent): void => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (
          !pasteNeedsConfirming(
            text,
            built.modes.bracketedPasteMode,
            broadcastingRef.current,
          )
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        confirmRef.current(text);
      };
      container.addEventListener('paste', pasting, true);

      const encoder = new TextEncoder();
      const typed = built.onData((data) => {
        /* Typing anything ends the selection, so a selection left on screen
           costs at most one Ctrl-C. Done here rather than in the key handler
           because that one also sees the `keydown` for Ctrl itself, and
           clearing there would erase the selection a moment before the C
           arrived to copy it. */
        built.clearSelection();
        inputRef.current(encoder.encode(data));
      });
      /* Paste and anything else that arrives as bytes rather than text. */
      const binary = built.onBinary((data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
        inputRef.current(bytes);
      });

      /* The remote pty has to be told, or every program that draws by column
         count keeps drawing at the old width. Read through a ref: the handle
         this answers for is whichever one is current. */
      const observer = new ResizeObserver(() => {
        fit.fit();
        const current = handleRef.current;
        if (current !== null) {
          void resizeTerminal(current, built.cols, built.rows, slotRef.current);
        }
        setState((now) => ({
          ...now,
          size: { columns: built.cols, rows: built.rows },
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
        () => built.dispose(),
      );

      setTerminal(built);
    };

    void start();

    return () => {
      disposed = true;
      writeRef.current = null;
      terminalRef.current = null;
      setTerminal(null);
      for (const stop of teardown.reverse()) stop();
    };
  }, [container, bound]);

  /* The shell, bound to whichever handle is current (ADR-0079). A new handle
     closes the old watch and opens a shell on the new connection into the
     terminal that is already on screen. */
  const previousHandle = useRef<SessionHandle | null>(null);
  useEffect(() => {
    if (terminal === null || handle === null) return;

    let disposed = false;
    const stops: Array<() => void> = [];

    /* The folder the shell says it is in (OSC 7), for the SFTP pane's "the
       terminal's folder". Registered before output starts, so the first
       prompt is not missed. Only the primary shell reports: with a second
       shell on the connection (ADR-0077) there would be two answers to one
       question, and the first shell is the one the pane is paired with. */
    if (slot === 'primary') {
      const cwdHandler = terminal.parser.registerOscHandler(7, (data) => {
        const cwd = parseOsc7(data);
        if (cwd !== null) reportTerminalCwd(handle, cwd);
        return true;
      });
      stops.push(() => {
        cwdHandler.dispose();
        forgetTerminalCwd(handle);
      });
    }

    const bind = async (): Promise<void> => {
      /* Registered before the shell opens: a shell that closes right after
         opening must not be able to race this subscription. The SFTP
         transfer events had the same race; see `watchTerminal`'s own doc
         comment for the mechanism. */
      const stopWatching = await watchTerminal(
        handle,
        (bytes) => {
          writeRef.current?.(bytes);
        },
        (exitStatus, connectionLost) => {
          setState((current) => ({ ...current, closed: true, exitStatus, connectionLost }));
          if (connectionLost) terminal.write(`\r\n\x1b[2m${i18n.t('terminal.connectionLost')}\x1b[0m\r\n`);
        },
        slot,
      );
      if (disposed) {
        stopWatching();
        return;
      }
      stops.push(stopWatching);

      if (previousHandle.current !== null && previousHandle.current !== handle) {
        setState((current) => ({ ...current, closed: false, exitStatus: null, connectionLost: false }));
        terminal.write(`\r\n\x1b[2m${i18n.t('terminal.reconnected')}\x1b[0m\r\n`);
      }
      previousHandle.current = handle;

      await openTerminal(handle, terminal.cols, terminal.rows, slot);
    };

    void bind();

    return () => {
      disposed = true;
      for (const stop of stops.reverse()) stop();
    };
  }, [terminal, handle, slot]);

  return { ...state, focus, clipboard };
}
