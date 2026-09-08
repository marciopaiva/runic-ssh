// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `status-teardown.test.ts` for why.

/**
 * Five of the hooks behind the monitor workspace's detail panel.
 * `use-systemd-units.ts`, `use-processes.ts`, `use-ports.ts` and
 * `use-unit-journal.ts` are all polling loops and need the same teardown
 * proof every other probe in this codebase gets (section 6).
 * `use-stats-history.ts` has no timer to leak, but it does have a rule
 * worth pinning: history resets on a host switch and never records a
 * reading that was not actually taken.
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

const PROCESS = {
  pid: 1,
  user: 'deploy',
  cpuPercent: 0.3,
  memPercent: 0.4,
  command: '/usr/sbin/sshd -D',
};

const JOURNAL_LINE = '2026-09-07T15:12:02+00:00 sshd-session[2995]: Accepted password for deploy';

const PORT = {
  protocol: 'tcp',
  state: 'LISTEN',
  address: '0.0.0.0',
  port: 22,
  process: 'users:(("sshd",pid=1,fd=3))',
};

const ipc = vi.hoisted(() => ({
  sessionSystemdUnits: vi.fn(async () => [UNIT]),
  sessionSystemInfo: vi.fn(async () => INFO),
  sessionProcesses: vi.fn(async () => [PROCESS]),
  sessionUnitJournal: vi.fn(async () => [JOURNAL_LINE]),
  sessionPorts: vi.fn(async () => [PORT]),
}));

vi.mock('../src/ipc', () => ipc);

const { useSystemdUnits } = await import('../src/features/monitor/use-systemd-units');
const { useStatsHistory } = await import('../src/features/monitor/use-stats-history');
const { useSystemInfo } = await import('../src/features/monitor/use-system-info');
const { useProcesses } = await import('../src/features/monitor/use-processes');
const { useUnitJournal } = await import('../src/features/monitor/use-unit-journal');
const { usePorts } = await import('../src/features/monitor/use-ports');

let renders: unknown[] = [];

function InfoProbe(props: { handle: number | null }): null {
  renders.push(useSystemInfo(props.handle));
  return null;
}

function UnitsProbe(props: { handle: number | null }): null {
  renders.push(useSystemdUnits(props.handle));
  return null;
}

function ProcessesProbe(props: { handle: number | null }): null {
  renders.push(useProcesses(props.handle));
  return null;
}

function JournalProbe(props: { handle: number | null; unit: string | null }): null {
  renders.push(useUnitJournal(props.handle, props.unit));
  return null;
}

function PortsProbe(props: { handle: number | null }): null {
  renders.push(usePorts(props.handle));
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
  ipc.sessionProcesses.mockClear();
  ipc.sessionUnitJournal.mockClear();
  ipc.sessionPorts.mockClear();
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

describe('polling the process list', () => {
  it('reads the process list while a handle is given', async () => {
    const probe = await mount(createElement(ProcessesProbe, { handle: 4 }));

    expect(renders.at(-1)).toEqual([PROCESS]);
    expect(ipc.sessionProcesses).toHaveBeenCalledWith(4);

    await probe.unmount();
  });

  it('polls nothing with no handle, the tab-not-visible convention', async () => {
    const probe = await mount(createElement(ProcessesProbe, { handle: null }));

    expect(ipc.sessionProcesses).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('clears its interval on unmount', async () => {
    const probe = await mount(createElement(ProcessesProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('stops polling once the handle goes back to null', async () => {
    const probe = await mount(createElement(ProcessesProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.rerender(createElement(ProcessesProbe, { handle: null }));

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    expect(renders.at(-1)).toEqual([]);

    await probe.unmount();
  });
});

describe('polling the listening-socket list', () => {
  it('reads the port list while a handle is given', async () => {
    const probe = await mount(createElement(PortsProbe, { handle: 4 }));

    expect(renders.at(-1)).toEqual([PORT]);
    expect(ipc.sessionPorts).toHaveBeenCalledWith(4);

    await probe.unmount();
  });

  it('polls nothing with no handle, the tab-not-visible convention', async () => {
    const probe = await mount(createElement(PortsProbe, { handle: null }));

    expect(ipc.sessionPorts).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('clears its interval on unmount', async () => {
    const probe = await mount(createElement(PortsProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('stops polling once the handle goes back to null', async () => {
    const probe = await mount(createElement(PortsProbe, { handle: 1 }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.rerender(createElement(PortsProbe, { handle: null }));

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    expect(renders.at(-1)).toEqual([]);

    await probe.unmount();
  });
});

describe("polling a unit's own journal", () => {
  it('reads the journal while both a handle and a unit are given', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: 4, unit: 'ssh.service' }));

    expect(renders.at(-1)).toEqual([JOURNAL_LINE]);
    expect(ipc.sessionUnitJournal).toHaveBeenCalledWith(4, 'ssh.service');

    await probe.unmount();
  });

  it('polls nothing with no unit selected, even with a handle', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: 4, unit: null }));

    expect(ipc.sessionUnitJournal).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('polls nothing with no handle, even with a unit selected', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: null, unit: 'ssh.service' }));

    expect(ipc.sessionUnitJournal).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('clears its interval on unmount', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: 1, unit: 'ssh.service' }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('re-fetches and clears the old interval when the selected unit changes', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: 1, unit: 'ssh.service' }));
    const firstTimer = setIntervalSpy.mock.results[0]?.value;

    await probe.rerender(createElement(JournalProbe, { handle: 1, unit: 'cron.service' }));

    expect(clearIntervalSpy).toHaveBeenCalledWith(firstTimer);
    expect(ipc.sessionUnitJournal).toHaveBeenCalledWith(1, 'cron.service');

    await probe.unmount();
  });

  it('stops polling once the unit is deselected', async () => {
    const probe = await mount(createElement(JournalProbe, { handle: 1, unit: 'ssh.service' }));
    const timer = setIntervalSpy.mock.results[0]?.value;

    await probe.rerender(createElement(JournalProbe, { handle: 1, unit: null }));

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
  diskIo: null,
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
          diskIo: null,
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
          diskIo: null,
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
