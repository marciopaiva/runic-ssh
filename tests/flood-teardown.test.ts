// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * `measurePaced`'s own `setInterval`, cleared even when the run itself fails.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. The pump
 * used to clear itself only on the branch that checks elapsed time; a
 * `terminal.write` that throws mid-run never reaches that branch, so nothing
 * cleared the interval or disposed the terminals it had opened. The timer
 * went on firing every 16 ms, throwing again on the same terminals, and the
 * promise `measurePaced` was awaiting never settled to say so (#208).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const xterm = vi.hoisted(() => {
  class FakeTerminal {
    dispose = vi.fn();
    open = vi.fn();
    write = vi.fn();

    constructor() {
      xterm.instances.push(this);
    }
  }
  return { instances: [] as FakeTerminal[], FakeTerminal };
});

vi.mock('@xterm/xterm', () => ({ Terminal: xterm.FakeTerminal }));

const { measurePaced } = await import('../src/features/terminal/flood');

let host: HTMLDivElement;
let clock: number;

beforeEach(() => {
  xterm.instances.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  clock = 0;
  // `performance.now` is a plain counter this file drives by hand, not
  // sinon's own faked clock: advancing the fake `setInterval` a handful of
  // virtual milliseconds does not mean any real time passed, so the elapsed
  // check `measurePaced` runs on every tick needs telling separately when a
  // test wants it to trip. `requestAnimationFrame` stays real: the frame-gap
  // watcher it drives is not what this file has anything to say about.
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  host.remove();
});

describe('what a write failure inside the paced pump releases', () => {
  it('clears the interval instead of retrying it forever', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const run = measurePaced(host, 1, 1);
    /* Marks the rejection handled the instant it happens, inside the fake
       timer tick below, rather than on the next microtask when `expect(run)`
       gets to it. Node's unhandled-rejection check runs in between and does
       not know the second attachment is coming. */
    run.catch(() => undefined);
    const terminal = xterm.instances.at(0);
    if (terminal === undefined) throw new Error('measurePaced did not open a terminal');
    terminal.write.mockImplementation(() => {
      throw new Error('boom');
    });

    await vi.advanceTimersByTimeAsync(16);
    await expect(run).rejects.toThrow('boom');

    /* Not `toHaveBeenCalledOnce`: jsdom's own `requestAnimationFrame`
       polyfill clears an internal `setInterval` of its own once the frame it
       scheduled has run, and faking `clearInterval` globally catches that
       call too. What this test can tell apart from jsdom's plumbing is
       whether the pump itself was cleared, which the next assertion checks
       directly: no further write once the run has failed. */
    expect(clearIntervalSpy).toHaveBeenCalled();

    const callsSoFar = terminal.write.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(terminal.write.mock.calls.length).toBe(callsSoFar);
  });

  it('disposes every terminal it opened and clears the host', async () => {
    const run = measurePaced(host, 2, 1);
    run.catch(() => undefined);
    for (const terminal of xterm.instances) {
      terminal.write.mockImplementation(() => {
        throw new Error('boom');
      });
    }

    await vi.advanceTimersByTimeAsync(16);
    await expect(run).rejects.toThrow('boom');

    expect(xterm.instances).toHaveLength(2);
    for (const terminal of xterm.instances) {
      expect(terminal.dispose).toHaveBeenCalledOnce();
    }
    expect(host.children).toHaveLength(0);
  });

  it('still resolves normally when nothing throws', async () => {
    const run = measurePaced(host, 1, 1);
    clock = 1000;

    await vi.advanceTimersByTimeAsync(16);

    const result = await run;
    expect(result.terminals).toBe(1);
    expect(xterm.instances[0]?.dispose).toHaveBeenCalledOnce();
  });
});
