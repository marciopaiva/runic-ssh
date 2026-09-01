// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * Everything `useTerminal` registers, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs.
 * `ssh/registry.rs` is the reason: a resource with a cleanup nobody exercises
 * is one an early `return` above it can silently disable (#94, ADR-0014).
 * `use-terminal.ts` writes ten things into one `teardown` array; this mounts
 * the hook and unmounts it, and asserts every one of the ten was actually
 * called, not just that the array exists.
 *
 * `@xterm/xterm`, `@xterm/addon-fit` and the terminal palette are mocked: what
 * is under test is the registration and release around them, not xterm
 * itself, and `terminalTheme` throws outside a document carrying the design
 * tokens, which this test does not load.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* `@testing-library/react` normally sets this; without it `act` still runs
   but warns on every call, and the warning would drown out a real one. */
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
  openTerminal: vi.fn(async () => {}),
  resizeTerminal: vi.fn(async () => {}),
  watchTerminal: vi.fn(async () => vi.fn()),
}));

vi.mock('../src/ipc', () => ipc);

// Imported after the mocks above so `useTerminal` picks them up.
const { useTerminal } = await import('../src/features/terminal/use-terminal');

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

function Probe(props: {
  container: HTMLDivElement | null;
  handle: number | null;
}): null {
  useTerminal(
    props.container,
    props.handle,
    'control',
    () => {},
    () => {},
    false,
  );
  return null;
}

/** Mounts the hook, and hands back what a teardown has to release. */
async function mountProbe(container: HTMLDivElement, handle: number) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  const addEventListener = vi.spyOn(container, 'addEventListener');
  const removeEventListener = vi.spyOn(container, 'removeEventListener');

  await act(async () => {
    root.render(createElement(Probe, { container, handle }));
  });

  // `start()` inside the effect is async and fire-and-forget; wait for its
  // last await (opening the shell, which `watchTerminal` now precedes)
  // rather than guessing a delay.
  await vi.waitFor(() => {
    expect(ipc.openTerminal).toHaveBeenCalled();
  });

  const terminal = xterm.instances.at(-1);
  if (terminal === undefined) throw new Error('useTerminal did not build a terminal');

  const resizeObserver = resizeObserverInstances.at(-1);
  if (resizeObserver === undefined) throw new Error('useTerminal did not observe a resize');

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
  ipc.openTerminal.mockClear();
  ipc.resizeTerminal.mockClear();
  ipc.watchTerminal.mockClear();
  xterm.instances.length = 0;
});

describe('what unmounting a terminal releases', () => {
  it('removes both container listeners it added', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container, 1);

    expect(probe.addEventListener).toHaveBeenCalledWith('copy', expect.any(Function));
    expect(probe.addEventListener).toHaveBeenCalledWith(
      'paste',
      expect.any(Function),
      true,
    );

    await probe.unmount();

    expect(probe.removeEventListener).toHaveBeenCalledWith('copy', expect.any(Function));
    expect(probe.removeEventListener).toHaveBeenCalledWith(
      'paste',
      expect.any(Function),
      true,
    );
  });

  it('disconnects the resize observer', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container, 2);

    expect(probe.resizeObserver.observe).toHaveBeenCalledWith(container);

    await probe.unmount();

    expect(probe.resizeObserver.disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects the theme attribute observer', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container, 3);

    expect(MutationObserver.prototype.observe).toHaveBeenCalled();

    await probe.unmount();

    expect(MutationObserver.prototype.disconnect).toHaveBeenCalledOnce();
  });

  it('stops listening for the system theme change', async () => {
    const container = document.createElement('div');
    const probe = await mountProbe(container, 4);

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
    const probe = await mountProbe(container, 5);

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
    const probe = await mountProbe(container, 6);

    const stopWatching = (await ipc.watchTerminal.mock.results[0]?.value) as
      | ReturnType<typeof vi.fn>
      | undefined;
    if (stopWatching === undefined) {
      throw new Error('watchTerminal did not resolve an unsubscribe function');
    }

    await probe.unmount();

    expect(stopWatching).toHaveBeenCalledOnce();
  });
});
