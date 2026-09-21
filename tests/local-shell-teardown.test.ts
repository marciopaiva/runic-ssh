// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `terminal-teardown.test.ts`'s own note on why jsdom is per file here.

/**
 * Everything `useLocalShellTerminal` registers, unregistered on unmount, the
 * pty included.
 *
 * `terminal-teardown.test.ts` proves the SSH terminal's ten-item teardown
 * array actually runs; this is the same proof for the local shell hook, plus
 * the one thing that hook alone owns: unlike an SSH session, whose channel
 * outlives the terminal until the tab itself is closed, a local shell has no
 * other owner, so closing its backend pty has to be part of *this* teardown
 * or the child process outlives the component that opened it (CLAUDE.md
 * section 6, `ssh/registry.rs`'s own `has_shell` precedent).
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

    constructor() {
      xterm.instances.push(this);
    }
  }

  class FakeFitAddon {
    fit = vi.fn();
  }

  return { instances: [] as FakeTerminal[], FakeTerminal, FakeFitAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: xterm.FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xterm.FakeFitAddon }));
vi.mock('../src/features/terminal/theme', () => ({ terminalTheme: () => ({}) }));

const ipc = vi.hoisted(() => ({
  openLocalShell: vi.fn(async () => 1),
  resizeLocalShell: vi.fn(async () => {}),
  watchLocalShell: vi.fn(async () => vi.fn()),
  writeLocalShell: vi.fn(async () => {}),
  closeLocalShell: vi.fn(async () => {}),
}));

vi.mock('../src/ipc', () => ipc);

// Imported after the mocks above so `useLocalShellTerminal` picks them up.
const { useLocalShellTerminal } = await import(
  '../src/features/terminal/use-local-shell-terminal'
);

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

// A fresh object here would change identity every render, and since the
// hook's effect depends on `kind` by reference, that reopens the shell in a
// loop instead of once. `terminal-teardown.test.ts` never hits this because
// its handle is a primitive number, stable by value across renders.
const DEFAULT_SHELL: import('../src/ipc').LocalShellKind = { kind: 'defaultShell' };
const NOOP = (): void => {};

function Probe(props: { container: HTMLDivElement | null }): null {
  useLocalShellTerminal(props.container, DEFAULT_SHELL, 'control', NOOP, NOOP);
  return null;
}

/** Mounts the hook, and hands back what a teardown has to release. */
async function mountProbe(container: HTMLDivElement) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  const addEventListener = vi.spyOn(container, 'addEventListener');
  const removeEventListener = vi.spyOn(container, 'removeEventListener');

  await act(async () => {
    root.render(createElement(Probe, { container }));
  });

  // `start()` inside the effect is async and fire-and-forget; wait for the
  // shell to actually open rather than guessing a delay.
  await vi.waitFor(() => {
    expect(ipc.openLocalShell).toHaveBeenCalled();
  });

  await vi.waitFor(() => {
    expect(ipc.watchLocalShell).toHaveBeenCalled();
  });

  const terminal = xterm.instances.at(-1);
  if (terminal === undefined) throw new Error('useLocalShellTerminal did not build a terminal');

  const resizeObserver = resizeObserverInstances.at(-1);
  if (resizeObserver === undefined) throw new Error('useLocalShellTerminal did not observe a resize');

  return {
    terminal,
    addEventListener,
    removeEventListener,
    resizeObserver,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

let resizeObserverInstances: FakeResizeObserver[] = [];
let matchMediaListeners: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };

beforeEach(() => {
  resizeObserverInstances = [];
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation(function fake() {
      const instance = new FakeResizeObserver();
      resizeObserverInstances.push(instance);
      return instance;
    }),
  );

  matchMediaListeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, ...matchMediaListeners }),
  );

  vi.spyOn(MutationObserver.prototype, 'observe');
  vi.spyOn(MutationObserver.prototype, 'disconnect');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ipc.openLocalShell.mockClear();
  ipc.resizeLocalShell.mockClear();
  ipc.watchLocalShell.mockClear();
  ipc.writeLocalShell.mockClear();
  ipc.closeLocalShell.mockClear();
  xterm.instances.length = 0;
});

describe('what unmounting a local shell releases', () => {
  it('kills the backend pty, since nobody else holds this id', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    const id = await ipc.openLocalShell.mock.results[0]?.value;
    expect(ipc.closeLocalShell).not.toHaveBeenCalled();

    await probe.unmount();

    expect(ipc.closeLocalShell).toHaveBeenCalledWith(id);
  });

  it('removes both container listeners it added', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    expect(probe.addEventListener).toHaveBeenCalledWith('copy', expect.any(Function));
    expect(probe.addEventListener).toHaveBeenCalledWith('paste', expect.any(Function), true);

    await probe.unmount();

    expect(probe.removeEventListener).toHaveBeenCalledWith('copy', expect.any(Function));
    expect(probe.removeEventListener).toHaveBeenCalledWith('paste', expect.any(Function), true);
  });

  it('disconnects the resize observer', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    expect(probe.resizeObserver.observe).toHaveBeenCalledWith(container);

    await probe.unmount();

    expect(probe.resizeObserver.disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects the theme attribute observer', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    expect(MutationObserver.prototype.observe).toHaveBeenCalled();

    await probe.unmount();

    expect(MutationObserver.prototype.disconnect).toHaveBeenCalledOnce();
  });

  it('stops listening for the system theme change', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    expect(matchMediaListeners.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    await probe.unmount();

    expect(matchMediaListeners.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });

  it('disposes the input and binary subscriptions and the terminal itself', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    const onDataResult = probe.terminal.onData.mock.results[0]?.value as
      | { dispose: () => void }
      | undefined;
    const onBinaryResult = probe.terminal.onBinary.mock.results[0]?.value as
      | { dispose: () => void }
      | undefined;
    if (onDataResult === undefined || onBinaryResult === undefined) {
      throw new Error('onData/onBinary were not called');
    }

    await probe.unmount();

    expect(onDataResult.dispose).toHaveBeenCalledOnce();
    expect(onBinaryResult.dispose).toHaveBeenCalledOnce();
    expect(probe.terminal.dispose).toHaveBeenCalledOnce();
  });

  it('unsubscribes from the output and closed events', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container);

    const stopWatching = (await ipc.watchLocalShell.mock.results[0]?.value) as
      | ReturnType<typeof vi.fn>
      | undefined;
    if (stopWatching === undefined) {
      throw new Error('watchLocalShell did not resolve an unsubscribe function');
    }

    await probe.unmount();

    expect(stopWatching).toHaveBeenCalledOnce();
  });

  it('closes the shell it opened even when unmounted mid-open, before it could be watched', async () => {
    /* The doc comment on `useLocalShellTerminal` names this race by hand:
       `openLocalShell` has no handle to unsubscribe until it resolves, so a
       tab closed before then would otherwise leak the child process. */
    let resolveOpen: ((id: number) => void) | undefined;
    ipc.openLocalShell.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveOpen = resolve;
        }),
    );

    const container = document.createElement('div');
    const rootEl = document.createElement('div');
    document.body.appendChild(rootEl);
    const root = createRoot(rootEl);

    await act(async () => {
      root.render(createElement(Probe, { container }));
    });

    await vi.waitFor(() => {
      expect(ipc.openLocalShell).toHaveBeenCalled();
    });

    await act(async () => {
      root.unmount();
    });

    expect(ipc.closeLocalShell).not.toHaveBeenCalled();

    await act(async () => {
      resolveOpen?.(42);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ipc.closeLocalShell).toHaveBeenCalledWith(42);
    rootEl.remove();
  });
});
