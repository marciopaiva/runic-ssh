import { describe, expect, it } from 'vitest';

import { filterPorts } from '../src/features/monitor';
import type { ListeningSocket } from '../src/ipc';

function port(overrides: Partial<ListeningSocket> = {}): ListeningSocket {
  return {
    protocol: 'tcp',
    state: 'LISTEN',
    address: '0.0.0.0',
    port: 22,
    process: 'users:(("sshd",pid=1,fd=3))',
    ...overrides,
  };
}

describe('filtering the listening-socket list', () => {
  const ports = [
    port({ protocol: 'tcp', address: '0.0.0.0', port: 22, process: 'sshd' }),
    port({ protocol: 'udp', address: '127.0.0.1', port: 53, process: '' }),
  ];

  it('matches the empty query against everything', () => {
    expect(filterPorts(ports, '')).toEqual(ports);
  });

  it('matches the process case-insensitively', () => {
    expect(filterPorts(ports, 'SSHD')).toEqual([ports[0]]);
  });

  it('matches the address too, not only the process', () => {
    expect(filterPorts(ports, '127.0.0.1')).toEqual([ports[1]]);
  });

  it('matches the protocol', () => {
    expect(filterPorts(ports, 'udp')).toEqual([ports[1]]);
  });

  it('matches the port number', () => {
    expect(filterPorts(ports, '22')).toEqual([ports[0]]);
  });

  it('matches nothing when nothing matches', () => {
    expect(filterPorts(ports, 'nginx')).toEqual([]);
  });
});
