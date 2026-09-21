/**
 * Wiring one `xterm.js` instance to one local shell.
 *
 * Mirrors `use-terminal.ts`'s shape, not its code, for the same reason
 * `local_shell::registry` mirrors `ssh::registry` without sharing it
 * (ADR-0074): an SSH `SessionHandle` exists before this hook ever mounts, so
 * that hook subscribes before it opens and never races a shell that closes
 * right away. A local shell's id is minted by `openLocalShell` itself, so
 * there is nothing to subscribe against until that call resolves. This hook
 * opens first and leans on `watchLocalShell`'s own queue (see
 * `ipc/local-shell.ts`'s `unclaimed` map) to catch anything that arrived
 * first.
 *
 * A local shell never broadcasts and is never a macro target (ADR-0074
 * leaves that undecided and this is the conservative default), so unlike
 * `useTerminal` there is no `onInput` prop: a keystroke goes straight to
 * `writeLocalShell` and nowhere else.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';

import {
  closeLocalShell,
  openLocalShell,
  resizeLocalShell,
  watchLocalShell,
  writeLocalShell,
} from '../../ipc';
import type { LocalShellKind, LocalShellSessionId } from '../../ipc';

import { keyIntent, pasteNeedsConfirming } from './clipboard';
import { terminalTheme } from './theme';
import type { ClipboardApi, TerminalState } from './use-terminal';

/**
 * Mounts a terminal into `container` and opens `kind` behind it.
 *
 * Everything is torn down on unmount, the pty included: unlike a session
 * tab, whose SSH channel outlives the terminal until whatever closes the tab
 * says otherwise, a local shell's only reason to exist is this terminal, so
 * there is nobody else who would ever close it. `onOpened` still exists so
 * the caller can track the id for its own bookkeeping (the tab's `handle`),
 * not so it can close the shell independently.
 */
export function useLocalShellTerminal(
  container: HTMLDivElement | null,
  kind: LocalShellKind | null,
  modifier: 'meta' | 'control',
  onPasteNeedsConfirming: (text: string) => void,
  onOpened: (id: LocalShellSessionId) => void,
): TerminalState {
  const [state, setState] = useState<Omit<TerminalState, 'focus' | 'clipboard'>>({
    closed: false,
    exitStatus: null,
    size: null,
  });

  const writeRef = useRef<((bytes: Uint8Array) => void) | null>(null);

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

  const confirmRef = useRef(onPasteNeedsConfirming);
  confirmRef.current = onPasteNeedsConfirming;

  const modifierRef = useRef(modifier);
  modifierRef.current = modifier;

  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  useEffect(() => {
    if (container === null || kind === null) return;

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
        scrollback: 5000,
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
      terminalRef.current = terminal;

      const repaint = (): void => {
        terminal.options.theme = terminalTheme();
      };

      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
      systemTheme.addEventListener('change', repaint);

      const themeAttribute = new MutationObserver(repaint);
      themeAttribute.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });

      /* Opened before it can be watched: see this file's own doc comment.
         Anything that arrives before `watchLocalShell` registers below is
         queued by that call itself, not lost. */
      const id = await openLocalShell(kind, terminal.cols, terminal.rows);

      /* A tab closed while the shell was still opening leaves a real child
         process behind unless something closes it: nobody else knows this
         id exists yet. CLAUDE.md section 6: anything that outlives the call
         that started it gets a teardown path. */
      if (disposed) {
        systemTheme.removeEventListener('change', repaint);
        themeAttribute.disconnect();
        terminal.dispose();
        void closeLocalShell(id);
        return;
      }

      onOpenedRef.current(id);

      const stopWatching = await watchLocalShell(
        id,
        (bytes) => {
          writeRef.current?.(bytes);
        },
        (exitStatus) => {
          setState((current) => ({ ...current, closed: true, exitStatus }));
        },
      );

      if (disposed) {
        stopWatching();
        systemTheme.removeEventListener('change', repaint);
        themeAttribute.disconnect();
        terminal.dispose();
        void closeLocalShell(id);
        return;
      }

      terminal.attachCustomKeyEventHandler((event) => {
        const intent = keyIntent(event, terminal.hasSelection(), modifierRef.current);
        return intent === 'send';
      });

      const copied = (): void => terminal.clearSelection();
      container.addEventListener('copy', copied);

      const pasting = (event: ClipboardEvent): void => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        /* A local shell is never a broadcast target, so the only question is
           whether this one shell brackets paste. */
        if (!pasteNeedsConfirming(text, terminal.modes.bracketedPasteMode, false)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        confirmRef.current(text);
      };
      container.addEventListener('paste', pasting, true);

      const encoder = new TextEncoder();
      const typed = terminal.onData((data) => {
        terminal.clearSelection();
        void writeLocalShell(id, encoder.encode(data));
      });
      const binary = terminal.onBinary((data) => {
        const bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
        void writeLocalShell(id, bytes);
      });

      const observer = new ResizeObserver(() => {
        fit.fit();
        void resizeLocalShell(id, terminal.cols, terminal.rows);
        setState((current) => ({
          ...current,
          size: { columns: terminal.cols, rows: terminal.rows },
        }));
      });
      observer.observe(container);

      teardown.push(
        /* The doc comment above promises the pty dies with this terminal:
           nobody else holds this id, so nobody else would ever close it. */
        () => void closeLocalShell(id),
        () => container.removeEventListener('copy', copied),
        () => container.removeEventListener('paste', pasting, true),
        () => systemTheme.removeEventListener('change', repaint),
        () => themeAttribute.disconnect(),
        () => observer.disconnect(),
        () => typed.dispose(),
        () => binary.dispose(),
        stopWatching,
        () => terminal.dispose(),
      );
    };

    void start();

    return () => {
      disposed = true;
      writeRef.current = null;
      terminalRef.current = null;
      for (const stop of teardown.reverse()) stop();
    };
  }, [container, kind]);

  return { ...state, focus, clipboard };
}
