/**
 * Guards when a command to several hosts has to be held to confirm.
 *
 * A guard against a slip, not a security control (ADR-0081). What is pinned
 * here is the edge: one host is never slowed, two in the default Space are
 * not, and two with any in production are.
 */

import { describe, expect, it } from 'vitest';

import { HOLD_MS, needsHold, productionHosts } from '../src/features/spaces/guard';
import type { Space } from '../src/ipc';

const spaces: readonly Space[] = [
  { id: 'prod', name: 'Production', weight: 'production' },
  { id: 'lab', name: 'Lab', weight: 'normal' },
];

const hosts = [
  { id: 'a', name: 'a', space: 'prod' },
  { id: 'b', name: 'b', space: 'prod' },
  { id: 'c', name: 'c', space: 'lab' },
  { id: 'd', name: 'd' },
  { id: 'e', name: 'e', space: 'gone' },
];

describe('the production guard', () => {
  it('never slows a single host, even in production', () => {
    expect(needsHold(['a'], hosts, spaces)).toBe(false);
  });

  it('does not slow several hosts outside production', () => {
    expect(needsHold(['c', 'd'], hosts, spaces)).toBe(false);
    expect(needsHold(['d', 'e'], hosts, spaces)).toBe(false);
  });

  it('holds two or more with any in production', () => {
    expect(needsHold(['a', 'b'], hosts, spaces)).toBe(true);
    expect(needsHold(['a', 'c'], hosts, spaces)).toBe(true);
  });

  it('counts a host once however many times it is named', () => {
    expect(needsHold(['a', 'a'], hosts, spaces)).toBe(false);
  });

  it('treats a deleted Space as the default, which is not production', () => {
    expect(productionHosts(['e'], hosts, spaces)).toEqual([]);
  });

  it('names which of the hosts are in production', () => {
    expect(productionHosts(['a', 'c', 'd'], hosts, spaces)).toEqual(['a']);
  });

  it('holds for about 800ms', () => {
    expect(HOLD_MS).toBe(800);
  });
});
