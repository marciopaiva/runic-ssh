// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `terminal-teardown.test.ts`'s own note on jsdom's `URL`.

/**
 * Guards #281: a shell that closes without ever sending an exit-status
 * request left the tab looking connected forever.
 *
 * Reproduced live against `runic-test-sshd`: `ssh/terminal.rs`'s `pump`
 * correctly saw `Eof` and called `sink.closed(None)`, and the frontend
 * correctly received `CLOSED_EVENT` with `exitStatus: null` — the whole
 * pipeline #280 fixed worked exactly as intended. The bug was one level up:
 * `TerminalState.exitStatus` used `null` to mean both "still running" and
 * "closed, no numeric status known," and `TerminalView.tsx` gated its banner
 * on `exitStatus !== null`, so a close that never got as far as an
 * exit-status request rendered nothing at all.
 *
 * `TerminalState` gains a `closed` field set unconditionally by
 * `watchTerminal`'s `onClose`, independent of whatever `exitStatus` turned
 * out to be. This file drives that callback directly, the same way
 * `terminal-teardown.test.ts` drives the hook through a mocked `../src/ipc`,
 * rather than going through `@tauri-apps/api/event`: that layer's own
 * correctness is `terminal-events.test.ts`'s job.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const xterm = vi.hoisted(() => {
  class FakeTerminal {
    cols = 80;
    rows = 24;
    options: { theme?: unknown } = {};
    modes = { bracketedPasteMode: false };
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    hasSelection = vi.fn(() => false);
    clearSelection = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onBinary = vi.fn(() => ({ dispose: vi.fn() }));
  }

  class FakeFitAddon {
    fit = vi.fn();
  }

  return { FakeTerminal, FakeFitAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: xterm.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xterm.FakeFitAddon }));
vi.mock('../src/features/terminal/theme', () => ({ terminalTheme: () => ({}) }));

type CloseHandler = (exitStatus: number | null) => void;

const ipc = vi.hoisted(() => {
  const closeHandlers: CloseHandler[] = [];
  return {
    openTerminal: vi.fn(async () => {}),
    resizeTerminal: vi.fn(async () => {}),
    watchTerminal: vi.fn(async (_handle: number, _onBatch: unknown, onClose: CloseHandler) => {
      closeHandlers.push(onClose);
      return vi.fn();
    }),
    closeHandlers,
  };
});

vi.mock('../src/ipc', () => ipc);

const { useTerminal } = await import('../src/features/terminal/use-terminal');
type TerminalState = Awaited<ReturnType<typeof useTerminal>>;

function Probe(props: {
  container: HTMLDivElement | null;
  handle: number | null;
  onState: (state: TerminalState) => void;
}): null {
  const state = useTerminal(props.container, props.handle, 'control', () => {}, () => {}, false);
  props.onState(state);
  return null;
}

async function mountProbe(handle: number) {
  const container = document.createElement('div');
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  let latest: TerminalState | null = null;
  await act(async () => {
    root.render(createElement(Probe, { container, handle, onState: (state) => (latest = state) }));
  });

  await vi.waitFor(() => {
    expect(ipc.watchTerminal).toHaveBeenCalled();
  });

  return {
    state: (): TerminalState => {
      if (latest === null) throw new Error('useTerminal never reported a state');
      return latest;
    },
    async fireClose(exitStatus: number | null): Promise<void> {
      const onClose = ipc.closeHandlers.at(-1);
      if (onClose === undefined) throw new Error('watchTerminal was not called');
      await act(async () => {
        onClose(exitStatus);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  ipc.openTerminal.mockClear();
  ipc.resizeTerminal.mockClear();
  ipc.watchTerminal.mockClear();
  ipc.closeHandlers.length = 0;
});

describe('a shell that closes (#281)', () => {
  it('starts open, not closed', async () => {
    const probe = await mountProbe(1);

    expect(probe.state().closed).toBe(false);
    expect(probe.state().exitStatus).toBeNull();

    await probe.unmount();
  });

  it('is marked closed even when no numeric exit status ever arrives', async () => {
    /* The exact shape #281 reproduced: `sink.closed(None)`, `exitStatus:
       null` — indistinguishable from "still open" without a separate flag. */
    const probe = await mountProbe(2);

    await probe.fireClose(null);

    expect(probe.state().closed).toBe(true);
    expect(probe.state().exitStatus).toBeNull();

    await probe.unmount();
  });

  it('is marked closed and keeps the exit status when one does arrive', async () => {
    const probe = await mountProbe(3);

    await probe.fireClose(0);

    expect(probe.state().closed).toBe(true);
    expect(probe.state().exitStatus).toBe(0);

    await probe.unmount();
  });
});
