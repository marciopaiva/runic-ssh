// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `status-teardown.test.ts` for why.

/**
 * The two hooks behind the monitor workspace's detail panel.
 * `use-systemd-units.ts` is a polling loop and needs the same teardown proof
 * every other probe in this codebase gets (section 6). `use-stats-history.ts`
 * has no timer to leak, but it does have a rule worth pinning: history resets
 * on a host switch and never records a reading that was not actually taken.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SystemStats } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const UNIT = {
  name: 'ssh.service',
  load: 'loaded',
  active: 'active',
  sub: 'running',
  description: 'OpenBSD Secure Shell server',
};

const INFO = { osName: 'Debian GNU/Linux 13 (trixie)', kernel: 'Linux 6.6.87.2 x86_64', hostname: 'web-01', cpuModel: null };

const ipc = vi.hoisted(() => ({
  sessionSystemdUnits: vi.fn(async () => [UNIT]),
  sessionSystemInfo: vi.fn(async () => INFO),
}));

vi.mock('../src/ipc', () => ipc);

const { useSystemdUnits } = await import('../src/features/monitor/use-systemd-units');
const { useStatsHistory } = await import('../src/features/monitor/use-stats-history');
const { useSystemInfo } = await import('../src/features/monitor/use-system-info');

let renders: unknown[] = [];

function InfoProbe(props: { handle: number | null }): null {
  renders.push(useSystemInfo(props.handle));
  return null;
}

function UnitsProbe(props: { handle: number | null }): null {
  renders.push(useSystemdUnits(props.handle));
  return null;
}

function HistoryProbe(props: { handle: number | null; stats: SystemStats }): null {
  renders.push(useStatsHistory(props.handle, props.stats));
  return null;
}

async function mount(element: ReturnType<typeof createElement>) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(element);
  });

  return {
    async rerender(next: ReturnType<typeof createElement>) {
      await act(async () => {
        root.render(next);
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

let setIntervalSpy: ReturnType<typeof vi.spyOn>;
let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  renders = [];
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
});

afterEach(() => {
  vi.restoreAllMocks();
  ipc.sessionSystemdUnits.mockClear();
  ipc.sessionSystemInfo.mockClear();
});

describe('a selected host\'s own identity', () => {
  it('reads it once while a handle is given, not on an interval', async () => {
    const probe = await mount(createElement(InfoProbe, { handle: 7 }));

    expect(renders.at(-1)).toEqual(INFO);
    expect(ipc.sessionSystemInfo).toHaveBeenCalledWith(7);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('reads nothing with no handle', async () => {
    const probe = await mount(createElement(InfoProbe, { handle: null }));

    expect(ipc.sessionSystemInfo).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('clears the previous host\'s identity the moment a different one is picked', async () => {
    const probe = await mount(createElement(InfoProbe, { handle: 1 }));
    expect(renders.at(-1)).toEqual(INFO);

    await probe.rerender(createElement(InfoProbe, { handle: null }));

    expect(renders.at(-1)).toEqual({ osName: null, kernel: null, hostname: null, cpuModel: null });

    await probe.unmount();
  });
});

describe('polling systemd units', () => {
  it('reads the unit list while a handle is given', async () => {
    const probe = await mount(createElement(UnitsProbe, { handle: 4 }));

    expect(renders.at(-1)).toEqual([UNIT]);
    expect(ipc.sessionSystemdUnits).toHaveBeenCalledWith(4);

    await probe.unmount();
  });

  it('polls nothing with no handle, the tab-not-visible convention', async () => {
    const probe = await mount(createElement(UnitsProbe, { handle: null }));

    expect(ipc.sessionSystemdUnits).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('clears its interval on unmount', async () => {
    const probe = await mount(createElement(UnitsProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('stops polling once the handle goes back to null', async () => {
    const probe = await mount(createElement(UnitsProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.rerender(createElement(UnitsProbe, { handle: null }));

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    expect(renders.at(-1)).toEqual([]);

    await probe.unmount();
  });
});

const NO_STATS: SystemStats = {
  cpuPercent: null,
  memory: null,
  swap: null,
  disk: null,
  filesystems: [],
  network: null,
  uptimeSeconds: null,
  loadAverage: null,
};

/** The values alone, ignoring each sample's own timestamp. */
function values(history: unknown): unknown {
  const typed = history as { cpu: { value: number }[]; ramPercent: { value: number }[] };
  return { cpu: typed.cpu.map((s) => s.value), ramPercent: typed.ramPercent.map((s) => s.value) };
}

describe('a host\'s own rolling history', () => {
  it('records nothing from a reading with nothing measured', async () => {
    const probe = await mount(createElement(HistoryProbe, { handle: 1, stats: NO_STATS }));

    expect(values(renders.at(-1))).toEqual({ cpu: [], ramPercent: [] });

    await probe.unmount();
  });

  it('appends a real reading', async () => {
    const probe = await mount(createElement(HistoryProbe, { handle: 1, stats: NO_STATS }));

    await probe.rerender(
      createElement(HistoryProbe, {
        handle: 1,
        stats: {
          cpuPercent: 42,
          memory: { usedKb: 50, totalKb: 200 },
          swap: null,
          disk: null,
          filesystems: [],
          network: null,
          uptimeSeconds: null,
          loadAverage: null,
        },
      }),
    );

    expect(values(renders.at(-1))).toEqual({ cpu: [42], ramPercent: [25] });

    await probe.unmount();
  });

  it('resets when the selected host changes, so one host never shows against another\'s history', async () => {
    const probe = await mount(
      createElement(HistoryProbe, {
        handle: 1,
        stats: {
          cpuPercent: 90,
          memory: null,
          swap: null,
          disk: null,
          filesystems: [],
          network: null,
          uptimeSeconds: null,
          loadAverage: null,
        },
      }),
    );
    expect(values(renders.at(-1))).toEqual({ cpu: [90], ramPercent: [] });

    await probe.rerender(createElement(HistoryProbe, { handle: 2, stats: NO_STATS }));

    expect(values(renders.at(-1))).toEqual({ cpu: [], ramPercent: [] });

    await probe.unmount();
  });
});
