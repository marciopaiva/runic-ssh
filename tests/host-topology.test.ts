/**
 * Home's own host book, organized by what `proxyJump` already says instead
 * of a hand-typed group (ADR-0060).
 *
 * `orderChain` (`jump.ts`, covered in `jump-host.test.ts`) already proves
 * the placement itself is cycle-safe and dangling-safe. What is new here is
 * the layer on top of it: which root starts which section, which hosts a
 * name search keeps around only so a match has something to nest under,
 * and which of those a manual fold still has to yield to.
 */

import { describe, expect, it } from 'vitest';

import {
  filterHosts,
  hostGroupLabel,
  hostRows,
  hostSections,
  hostSubtreeCounts,
  visibleHostRows,
} from '../src/features/sessions/state';
import type { ConnectionKind, LiveSession } from '../src/features/sessions/state';
import type { Session } from '../src/ipc';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: id,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    forwards: [],
    ...overrides,
  };
}

function live(id: string, overrides: Partial<Session> = {}, kind: ConnectionKind = 'saved'): LiveSession {
  return { session: session(id, overrides), handle: null, kind };
}

describe('sectioning the book by topology', () => {
  it('puts a bastion and its rider in Bastions, everything else in Direct', () => {
    const sessions = [
      live('runic-bastion', { kind: 'jumpServer' }),
      live('runic-target-a', { proxyJump: 'runic-bastion', kind: 'target' }),
      live('dev-web', { kind: 'direct' }),
    ];

    const { bastions, direct } = hostSections(hostRows(sessions));

    expect(bastions.map((row) => [row.live.session.id, row.depth])).toEqual([
      ['runic-bastion', 0],
      ['runic-target-a', 1],
    ]);
    expect(direct.map((row) => row.live.session.id)).toEqual(['dev-web']);
  });

  it('leaves Bastions empty when nothing carries anything', () => {
    const sessions = [live('dev-web'), live('dev-db')];

    const { bastions, direct } = hostSections(hostRows(sessions));

    expect(bastions).toEqual([]);
    expect(direct.map((row) => row.live.session.id)).toEqual(['dev-web', 'dev-db']);
  });

  it('nests a chain two hops deep', () => {
    const sessions = [
      live('edge', { kind: 'jumpServer' }),
      live('inner', { proxyJump: 'edge', kind: 'jumpServer' }),
      live('leaf', { proxyJump: 'inner', kind: 'target' }),
    ];

    const { bastions, direct } = hostSections(hostRows(sessions));

    expect(bastions.map((row) => [row.live.session.id, row.depth])).toEqual([
      ['edge', 0],
      ['inner', 1],
      ['leaf', 2],
    ]);
    expect(direct).toEqual([]);
  });

  it('renders a dangling proxyJump as an unnested root, in Direct if it carries nothing', () => {
    const sessions = [live('orphan', { proxyJump: 'nothing-saved-by-this-id' })];

    const { bastions, direct } = hostSections(hostRows(sessions));

    expect(bastions).toEqual([]);
    expect(direct.map((row) => row.live.session.id)).toEqual(['orphan']);
  });
});

describe('filtering the book by name', () => {
  const sessions = [
    live('runic-bastion', { kind: 'jumpServer' }),
    live('runic-target-a', { proxyJump: 'runic-bastion', kind: 'target' }),
    live('dev-web', { kind: 'direct' }),
  ];

  it('keeps a bastion around, unmatched, so a matching rider has something to nest under', () => {
    const { survivors, forceExpanded } = filterHosts(sessions, 'target-a');

    expect(survivors.map((live) => live.session.id).sort()).toEqual(['runic-bastion', 'runic-target-a']);
    expect(forceExpanded.has('runic-bastion')).toBe(true);
  });

  it('does not force-expand a bastion that matched by its own name', () => {
    const { forceExpanded } = filterHosts(sessions, 'runic-bastion');

    expect(forceExpanded.has('runic-bastion')).toBe(false);
  });

  it('drops everything when nothing matches', () => {
    const { survivors, forceExpanded } = filterHosts(sessions, 'nothing-named-this');

    expect(survivors).toEqual([]);
    expect(forceExpanded.size).toBe(0);
  });

  it('returns every host unchanged for an empty query', () => {
    const { survivors, forceExpanded } = filterHosts(sessions, '  ');

    expect(survivors).toBe(sessions);
    expect(forceExpanded.size).toBe(0);
  });

  it('does not loop forever on a two-way cycle written by hand', () => {
    const cyclic = [
      live('a', { proxyJump: 'b' }),
      live('b', { proxyJump: 'a' }),
    ];

    expect(() => filterHosts(cyclic, 'a')).not.toThrow();
  });
});

describe('which rows a manual fold actually hides', () => {
  const rows = hostRows([
    live('runic-bastion', { kind: 'jumpServer' }),
    live('runic-target-a', { proxyJump: 'runic-bastion', kind: 'target' }),
    live('dev-web', { kind: 'direct' }),
  ]);

  it('hides a collapsed bastion\'s own children, not the bastion row itself', () => {
    const visible = visibleHostRows(rows, new Set(['runic-bastion']), new Set());

    expect(visible.map((row) => row.live.session.id)).toEqual(['runic-bastion', 'dev-web']);
  });

  it('shows everything when nothing is collapsed', () => {
    const visible = visibleHostRows(rows, new Set(), new Set());

    expect(visible.map((row) => row.live.session.id)).toEqual([
      'runic-bastion',
      'runic-target-a',
      'dev-web',
    ]);
  });

  it('lets a search force a collapsed bastion back open', () => {
    const visible = visibleHostRows(rows, new Set(['runic-bastion']), new Set(['runic-bastion']));

    expect(visible.map((row) => row.live.session.id)).toEqual([
      'runic-bastion',
      'runic-target-a',
      'dev-web',
    ]);
  });
});

describe('the group pill a row shows', () => {
  it('reads a session that arrived without the field at all', () => {
    /* What the core actually sends: `skip_serializing_if` omits `group`
       for a host with none, so it arrives `undefined`, never `null`
       (`jump.ts`'s `hasJumpHost` documents the same gotcha for
       `proxyJump`). A strict `!== null` check here crashed the whole list
       on `.trim()`, caught live rather than by this suite: every fixture
       above builds `group` explicitly as `null`, a shape the core does
       not send. */
    const wire = JSON.parse(
      '{"id":"a","name":"a","host":"a.example","port":22,"user":"deploy","kind":"direct","forwards":[]}',
    ) as Session;

    expect(hostGroupLabel(wire)).toBeNull();
  });

  it('treats an explicit null the same as absent', () => {
    expect(hostGroupLabel(session('a', { group: null }))).toBeNull();
  });

  it('treats a blank group the same as none', () => {
    expect(hostGroupLabel(session('a', { group: '  ' }))).toBeNull();
  });

  it('trims and keeps a real group', () => {
    expect(hostGroupLabel(session('a', { group: ' prod ' }))).toBe('prod');
  });
});

describe('what a collapsed bastion is standing in for', () => {
  it('counts what is nested under each root, regardless of fold state', () => {
    const rows = hostRows([
      live('edge', { kind: 'jumpServer' }),
      live('inner', { proxyJump: 'edge', kind: 'jumpServer' }),
      live('leaf', { proxyJump: 'inner', kind: 'target' }),
      live('dev-web'),
    ]);
    const { bastions } = hostSections(rows);

    const counts = hostSubtreeCounts(bastions);

    expect(counts.get('edge')).toBe(2);
    expect(counts.has('dev-web')).toBe(false);
  });
});
