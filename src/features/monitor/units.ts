/**
 * Reading a systemd unit list as something a screen can show.
 *
 * Pure and testable without a window: what a query matches, and what tone a
 * unit's own state reads as. Both are asserted here rather than eyeballed in
 * the component that draws them.
 */

import type { SystemdUnit } from '../../ipc';

/** How a unit's own state should read at a glance. */
export type UnitTone = 'ok' | 'warn' | 'muted';

/**
 * `failed` outranks everything: a unit `systemctl` calls `active` while its
 * own `sub` state is `failed` is still a unit that stopped doing its job,
 * and the two states disagreeing is itself worth a warn tone rather than
 * whichever field happened to be checked first.
 */
export function unitTone(unit: SystemdUnit): UnitTone {
  if (unit.active === 'failed' || unit.sub === 'failed') return 'warn';
  if (unit.active === 'active') return 'ok';
  return 'muted';
}

/** Case-insensitive, against the unit's name and its description. */
export function filterUnits(
  units: readonly SystemdUnit[],
  query: string,
): readonly SystemdUnit[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return units;

  return units.filter(
    (unit) =>
      unit.name.toLowerCase().includes(needle) || unit.description.toLowerCase().includes(needle),
  );
}
