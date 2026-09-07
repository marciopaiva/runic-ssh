/**
 * How full a percentage bar should read as, at a glance.
 *
 * 70/90 rather than round numbers picked for their own sake: below 70% a
 * host has headroom nobody needs to think about, 70-90% is worth noticing
 * on the way past, and past 90% is the zone a sysadmin actually opens this
 * screen to check for.
 */

export type MeterTone = 'ok' | 'warn' | 'danger';

export function meterTone(percent: number): MeterTone {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warn';
  return 'ok';
}
