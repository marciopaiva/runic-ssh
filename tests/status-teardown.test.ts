// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * Everything `useSessionStats` registers, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. This
 * hook holds two: a `visibilitychange` listener on the document, and a probe
 * interval that only exists while a session is open and the tab is visible.
 * `terminal-teardown.test.ts` is the pattern this follows.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ipc = vi.hoisted(() => ({
  sessionStats: vi.fn(async () => ({ fromHost: 0, toHost: 0, latencyMs: 12 })),
  asIpcError: vi.fn(() => undefined),
}));

vi.mock('../src/ipc', () => ipc);

const { useSessionStats } = await import('../src/features/status/use-status');

function Probe(props: { handle: number | null }): null {
  useSessionStats(props.handle);
  return null;
}

async function mountProbe(handle: number | null) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(Probe, { handle }));
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

let addEventListener: ReturnType<typeof vi.spyOn>;
let removeEventListener: ReturnType<typeof vi.spyOn>;
let setIntervalSpy: ReturnType<typeof vi.spyOn>;
let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addEventListener = vi.spyOn(document, 'addEventListener');
  removeEventListener = vi.spyOn(document, 'removeEventListener');
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
});

afterEach(() => {
  vi.restoreAllMocks();
  ipc.sessionStats.mockClear();
});

describe('what unmounting the status probe releases', () => {
  it('removes the visibilitychange listener', async () => {
    const probe = await mountProbe(1);

    expect(addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('clears the probe interval for an open, visible session', async () => {
    const probe = await mountProbe(7);

    expect(setIntervalSpy).toHaveBeenCalled();
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('never starts an interval with no session to probe', async () => {
    /* `shouldProbe` refuses a null handle. A timer started anyway would poll a
       session that no longer exists. */
    const probe = await mountProbe(null);

    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });
});
