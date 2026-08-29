// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * Everything `useChrome` registers, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. Of the
 * hook's two effects, only the second has something to prove: it subscribes
 * with `onWindowResized` and has to release that subscription whether it
 * resolves before or after the component is gone, since the `stop` ref has
 * nowhere to hold an answer that arrives late. The first effect guards a
 * `windowChrome` answer with the same `live` flag, but React 18 already turns
 * a state update on an unmounted component into a silent no-op. There is no
 * black-box way to tell that guard apart from its absence, and nothing left
 * to assert there that would fail if it were deleted.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const ipc = vi.hoisted(() => ({
  windowChrome: vi.fn(),
  isWindowMaximized: vi.fn(async () => false),
  onWindowResized: vi.fn(),
  minimizeWindow: vi.fn(async () => {}),
  toggleMaximizeWindow: vi.fn(async () => {}),
  closeWindow: vi.fn(async () => {}),
  setNativeDecorations: vi.fn(async () => ({})),
}));

vi.mock('../src/ipc', () => ipc);

const { useChrome } = await import('../src/features/chrome/use-chrome');

function Probe(): null {
  useChrome();
  return null;
}

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(Probe));
  });

  return {
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

const DEFAULT_CHROME = {
  controls: 'system',
  leadingInset: 0,
  commandModifier: 'control',
  nativeDecorations: false,
} as const;

beforeEach(() => {
  ipc.windowChrome.mockReset().mockResolvedValue(DEFAULT_CHROME);
  ipc.isWindowMaximized.mockReset().mockResolvedValue(false);
  ipc.onWindowResized.mockReset().mockResolvedValue(vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what unmounting the window chrome hook releases', () => {
  it('releases the resize subscription on unmount', async () => {
    const unlisten = vi.fn();
    ipc.onWindowResized.mockResolvedValue(unlisten);

    const probe = await mountProbe();
    await vi.waitFor(() => {
      expect(ipc.onWindowResized).toHaveBeenCalled();
    });

    await probe.unmount();

    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('releases a resize subscription that only resolves after unmount', async () => {
    /* The subscribe call is still in flight when the component goes away.
       The hook has nowhere to hold the eventual unlisten function, so it has
       to call it the moment it arrives instead of leaking it. */
    const resize = deferred<() => void>();
    ipc.onWindowResized.mockReturnValue(resize.promise);

    const probe = await mountProbe();
    await probe.unmount();

    const unlisten = vi.fn();
    resize.resolve(unlisten);
    await Promise.resolve();
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledOnce();
  });
});
