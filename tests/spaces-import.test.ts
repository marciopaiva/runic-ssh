/**
 * Guards the plan that offers groups as Spaces (ADR-0081).
 *
 * The property that matters is that applying it twice, or after a run that
 * stopped half way, moves what is left and makes nothing twice. The plan is the
 * only part with logic; applying it is a core write that touches `space` alone.
 */

import { describe, expect, it } from 'vitest';

import { planGroupImport } from '../src/features/spaces/import';
import type { Session, Space } from '../src/ipc';

function host(id: string, group: string | null, space?: string): Session {
  return {
    id,
    name: id,
    host: `${id}.example.test`,
    port: 22,
    user: 'deploy',
    group,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    forwards: [],
    ...(space === undefined ? {} : { space }),
  };
}

const space = (id: string, name: string): Space => ({ id, name, weight: 'normal' });

describe('offering groups as Spaces', () => {
  it('makes one item per group, in the order they first appear, with its hosts', () => {
    const plan = planGroupImport(
      [host('a', 'PROD'), host('b', 'LAB'), host('c', 'PROD'), host('d', null), host('e', '  ')],
      [],
    );
    expect(plan.items.map((item) => [item.name, item.hostIds, item.existing])).toEqual([
      ['PROD', ['a', 'c'], null],
      ['LAB', ['b'], null],
    ]);
    expect(plan.omitted).toEqual([]);
  });

  it('plans nothing when there are no groups', () => {
    expect(planGroupImport([host('a', null)], []).items).toEqual([]);
  });

  it('leaves a host somebody already filed where it is', () => {
    const plan = planGroupImport([host('a', 'PROD', 'p'), host('b', 'PROD')], [space('p', 'Prod')]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.hostIds).toEqual(['b']);
  });

  it('plans a host whose Space was deleted, since it is in the default one', () => {
    const plan = planGroupImport([host('a', 'PROD', 'gone')], []);
    expect(plan.items[0]?.hostIds).toEqual(['a']);
  });

  it('reuses a Space that already has the group name, case aside', () => {
    const plan = planGroupImport([host('a', 'PROD')], [space('p', 'Prod')]);
    expect(plan.items[0]?.existing).toBe('p');
  });

  it('is repeatable: after a Space exists the same group makes nothing new', () => {
    const before = planGroupImport([host('a', 'PROD'), host('b', 'LAB')], []);
    const half = planGroupImport([host('a', 'PROD'), host('b', 'LAB')], [space('p', 'PROD')]);
    expect(before.items.filter((item) => item.existing === null)).toHaveLength(2);
    expect(half.items.filter((item) => item.existing === null).map((item) => item.name)).toEqual(['LAB']);
  });

  it('treats two spellings of one group as one', () => {
    const plan = planGroupImport([host('a', 'Prod'), host('b', 'PROD ')], []);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.hostIds).toEqual(['a', 'b']);
  });

  it('cuts a long name to what a Space can hold', () => {
    const plan = planGroupImport([host('a', 'x'.repeat(60))], []);
    expect(plan.items[0]?.name).toHaveLength(40);
  });

  it('names the groups it cannot make when the list of Spaces is full', () => {
    const full = Array.from({ length: 32 }, (_, i) => space(`s${i}`, `S${i}`));
    const plan = planGroupImport([host('a', 'NEW'), host('b', 'S1')], full);
    expect(plan.omitted).toEqual(['NEW']);
    expect(plan.items.map((item) => item.name)).toEqual(['S1']);
  });
});
