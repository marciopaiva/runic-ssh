// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `status-teardown.test.ts` for why.

/**
 * Everything `useSystemStats` registers, unregistered on unmount.
 *
 * The same two things `status-teardown.test.ts` proves for
 * `useSessionStats`: a `visibilitychange` listener on the document, and a
 * probe interval that only exists while a session is open and the tab is
 * visible. Kept as its own file rather than folded into that one because the
 * two hooks mock a different IPC call and would otherwise share a
 * `vi.mock('../src/ipc', ...)` neither fully needs.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ipc = vi.hoisted(() => ({
  sessionMonitor: vi.fn(async () => ({
    cpuPercent: 12,
    memory: { usedKb: 100, totalKb: 200 },
    disk: { usedKb: 300, totalKb: 400 },
    uptimeSeconds: 3600,
  })),
  asIpcError: vi.fn(() => undefined),
}));

vi.mock('../src/ipc', () => ipc);

const { useSystemStats } = await import('../src/features/status/use-system-stats');

/** Every value the hook has returned so far, in render order. */
let renders: unknown[] = [];

function Probe(props: { handle: number | null }): null {
  renders.push(useSystemStats(props.handle));
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
  renders = [];
  addEventListener = vi.spyOn(document, 'addEventListener');
  removeEventListener = vi.spyOn(document, 'removeEventListener');
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
});

afterEach(() => {
  vi.restoreAllMocks();
  ipc.sessionMonitor.mockClear();
});

describe('what unmounting the monitor probe releases', () => {
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
    const probe = await mountProbe(null);

    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });
});

describe('what a lost probe does to the last reading', () => {
  it('keeps the last reading when the failure is not the session going away', async () => {
    const probe = await mountProbe(3);
    const afterFirstProbe = renders.at(-1);
    expect(afterFirstProbe).toMatchObject({ cpuPercent: 12 });

    ipc.sessionMonitor.mockRejectedValueOnce(new Error('transport hiccup'));
    ipc.asIpcError.mockReturnValueOnce(undefined);

    /* Fires the interval's own callback directly rather than faking timers.
       The hook's `setInterval` call is real, and this component renders
       nothing to look at, so the only thing worth waiting on is the promise
       the callback starts. */
    const tick = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    await act(async () => {
      tick();
      await Promise.resolve();
      await Promise.resolve();
    });

    /* `asIpcError`'s default `undefined` return does not read as
       `'unknownHandle'`, so a rejection that is not the session going away
       leaves the last reading exactly as it was, not blanked. */
    expect(renders.at(-1)).toEqual(afterFirstProbe);

    await probe.unmount();
  });
});
