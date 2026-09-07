import { describe, expect, it } from 'vitest';

import { filterUnits, unitTone } from '../src/features/monitor';
import type { SystemdUnit } from '../src/ipc';

function unit(overrides: Partial<SystemdUnit> = {}): SystemdUnit {
  return {
    name: 'ssh.service',
    load: 'loaded',
    active: 'active',
    sub: 'running',
    description: 'OpenBSD Secure Shell server',
    ...overrides,
  };
}

describe('grading a unit at a glance', () => {
  it('calls a running, active unit ok', () => {
    expect(unitTone(unit())).toBe('ok');
  });

  it('calls anything failed a warning, regardless of which field says so', () => {
    expect(unitTone(unit({ active: 'failed', sub: 'failed' }))).toBe('warn');
    /* A unit systemd itself reports inconsistently, active on one axis and
       failed on the other, is exactly the case worth flagging rather than
       picking one field to trust. */
    expect(unitTone(unit({ active: 'active', sub: 'failed' }))).toBe('warn');
  });

  it('calls an ordinarily stopped unit muted, not a warning', () => {
    /* Most units on a host are inactive on purpose (not started, or one-shot
       units that already ran). That is not something to flag. */
    expect(unitTone(unit({ active: 'inactive', sub: 'dead' }))).toBe('muted');
  });
});

describe('filtering the unit list', () => {
  const units = [
    unit({ name: 'ssh.service', description: 'OpenBSD Secure Shell server' }),
    unit({ name: 'cron.service', description: 'Regular background program processing daemon' }),
  ];

  it('matches the empty query against everything', () => {
    expect(filterUnits(units, '')).toEqual(units);
  });

  it('matches a name case-insensitively', () => {
    expect(filterUnits(units, 'SSH')).toEqual([units[0]]);
  });

  it('matches the description too, not only the name', () => {
    expect(filterUnits(units, 'daemon')).toEqual([units[1]]);
  });

  it('matches nothing when nothing matches', () => {
    expect(filterUnits(units, 'nginx')).toEqual([]);
  });
});
