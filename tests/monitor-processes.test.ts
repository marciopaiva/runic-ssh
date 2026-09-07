import { describe, expect, it } from 'vitest';

import { filterProcesses, sortProcesses } from '../src/features/monitor';
import type { Process } from '../src/ipc';

function process(overrides: Partial<Process> = {}): Process {
  return {
    pid: 1,
    user: 'deploy',
    cpuPercent: 0,
    memPercent: 0,
    command: '/usr/sbin/sshd -D',
    ...overrides,
  };
}

describe('filtering the process list', () => {
  const processes = [
    process({ pid: 1, user: 'deploy', command: '/usr/sbin/sshd -D' }),
    process({ pid: 2, user: 'root', command: '/lib/systemd/systemd' }),
  ];

  it('matches the empty query against everything', () => {
    expect(filterProcesses(processes, '')).toEqual(processes);
  });

  it('matches the command line case-insensitively', () => {
    expect(filterProcesses(processes, 'SSHD')).toEqual([processes[0]]);
  });

  it('matches the user too, not only the command', () => {
    expect(filterProcesses(processes, 'root')).toEqual([processes[1]]);
  });

  it('matches nothing when nothing matches', () => {
    expect(filterProcesses(processes, 'nginx')).toEqual([]);
  });
});

describe('sorting the process list', () => {
  const busyOnCpu = process({ pid: 1, cpuPercent: 40, memPercent: 2 });
  const busyOnMemory = process({ pid: 2, cpuPercent: 5, memPercent: 30 });
  const processes = [busyOnMemory, busyOnCpu];

  it('re-sorts by CPU without needing the host asked again', () => {
    expect(sortProcesses(processes, 'cpu')).toEqual([busyOnCpu, busyOnMemory]);
  });

  it('re-sorts the same list by memory', () => {
    expect(sortProcesses(processes, 'mem')).toEqual([busyOnMemory, busyOnCpu]);
  });

  it('leaves the list it was given alone', () => {
    sortProcesses(processes, 'mem');
    expect(processes).toEqual([busyOnMemory, busyOnCpu]);
  });
});
