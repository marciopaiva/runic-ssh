/**
 * State must read with the colour removed.
 *
 * Roughly one man in twelve cannot separate red from green, a terminal is used
 * in bright sunlight and at two in the morning, and a screenshot pasted into a
 * ticket is often greyscale. A sidebar that says "connected" only by being
 * green says it to some people and not others.
 *
 * These tests are what stops that being a good intention. They compare the
 * states with the colour thrown away.
 */

import { describe, expect, it } from 'vitest';

import { carrierName, markCarried } from '../src/features/sessions/carried';
import type { CarriedOn } from '../src/features/sessions/carried';
import {
  ALL_STATES,
  UNGROUPED_KEY,
  describeState,
  filterGroups,
  groupKey,
  groupNames,
  groupSessions,
  soloGroup,
} from '../src/features/sessions/state';
import type { ConnectionKind, LiveSession } from '../src/features/sessions/state';
import type { Session } from '../src/ipc';

function session(id: string, group: string | null = null): Session {
  return {
    id,
    name: id,
    host: '10.0.4.12',
    port: 22,
    user: 'deploy',
    group,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
  };
}

function live(id: string, group: string | null = null, kind: ConnectionKind = 'saved'): LiveSession {
  return { session: session(id, group), handle: null, kind };
}

describe('state without colour', () => {
  it('gives every state a shape of its own', () => {
    /* The assertion that matters: throw the tone away and the states must
       still be distinguishable. If two ever share a shape, one of them is
       readable only to people who can see the difference in hue. */
    const shapes = ALL_STATES.map((state) => state.shape);

    expect(new Set(shapes).size, `two states share a shape: ${shapes.join(', ')}`).toBe(
      ALL_STATES.length,
    );
  });

  it('gives every state words of its own', () => {
    /* Shape covers sight; the label covers a screen reader and a tooltip. */
    const labels = ALL_STATES.map((state) => state.label);
    expect(new Set(labels).size).toBe(ALL_STATES.length);
  });

  it('never leaves a state without a tone, either', () => {
    /* Colour is the second signal, not the absent one. */
    for (const state of ALL_STATES) {
      expect(state.tone, `${state.kind} has no tone`).not.toBe('');
    }
  });

  it('describes each kind as itself', () => {
    for (const state of ALL_STATES) {
      expect(describeState(state.kind)).toEqual(state);
    }
  });
});

describe('grouping', () => {
  it('keeps the order the file lists', () => {
    /* The file is the user's arrangement. Sorting it under them is the kind
       of helpfulness nobody asked for. */
    const groups = groupSessions([
      live('a', 'Staging'),
      live('b', 'Production'),
      live('c', 'Staging'),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Staging', 'Production']);
    expect(groups[0]?.sessions.map((s) => s.session.id)).toEqual(['a', 'c']);
  });

  it('puts sessions with no group last', () => {
    /* A heading-less run in the middle reads as a rendering bug. */
    const groups = groupSessions([live('loose'), live('a', 'Production')]);

    expect(groups.map((group) => group.name)).toEqual(['Production', null]);
  });

  it('treats an empty group name as no group at all', () => {
    const groups = groupSessions([live('a', '   ')]);
    expect(groups.map((group) => group.name)).toEqual([null]);
  });

  it('has nothing to say about nothing', () => {
    expect(groupSessions([])).toEqual([]);
  });
});

describe('finding a host by name', () => {
  it('keeps only the sessions a group whose name matches', () => {
    const groups = groupSessions([live('web-01', 'DEV'), live('db-01', 'DEV')]);

    expect(filterGroups(groups, 'web').map((group) => group.sessions.map((s) => s.session.id))).toEqual(
      [['web-01']],
    );
  });

  it('drops a group left with nothing to show', () => {
    const groups = groupSessions([live('web-01', 'DEV'), live('web-02', 'HOM')]);

    expect(filterGroups(groups, 'dev-only-match').map((group) => group.name)).toEqual([]);
  });

  it('is case-insensitive and ignores surrounding space', () => {
    const groups = groupSessions([live('Bastion-01', 'Bastions')]);

    expect(filterGroups(groups, '  BASTION  ')).toHaveLength(1);
  });

  it('returns every group for an empty query', () => {
    const groups = groupSessions([live('a', 'DEV'), live('b', 'HOM')]);

    expect(filterGroups(groups, '')).toEqual(groups);
    expect(filterGroups(groups, '   ')).toEqual(groups);
  });
});

describe('showing one group alone', () => {
  it('keeps every group when nobody asked', () => {
    const groups = groupSessions([live('a', 'DEV'), live('b', 'HOM')]);

    expect(soloGroup(groups, null)).toBe(groups);
  });

  it('keeps only the named group', () => {
    const groups = groupSessions([live('a', 'DEV'), live('b', 'HOM')]);

    expect(soloGroup(groups, 'HOM').map((group) => group.name)).toEqual(['HOM']);
  });

  it('reaches the heading-less run by its own key', () => {
    const groups = groupSessions([live('a', 'DEV'), live('loose')]);

    expect(soloGroup(groups, UNGROUPED_KEY).map((group) => group.name)).toEqual([null]);
    expect(groupKey({ name: null, sessions: [] })).toBe(UNGROUPED_KEY);
    expect(groupKey({ name: 'DEV', sessions: [] })).toBe('DEV');
  });
});

describe('naming every group already in use (#221)', () => {
  it('lists each name once, sorted rather than in file order', () => {
    /* Unlike groupSessions: this is a picker helping someone find a name
       among many before choosing one, not a display of hosts already
       placed under it. */
    expect(groupNames([live('a', 'HOM'), live('b', 'DEV'), live('c', 'DEV')])).toEqual(['DEV', 'HOM']);
  });

  it('leaves out hosts with no group', () => {
    expect(groupNames([live('a', 'DEV'), live('loose'), live('b', '   ')])).toEqual(['DEV']);
  });

  it('has nothing to say about nothing', () => {
    expect(groupNames([])).toEqual([]);
  });
});

describe('a bastion carrying somebody else', () => {
  function rider(kind: ConnectionKind, handle: number | null): LiveSession {
    return { session: session('web'), handle, kind };
  }

  function bastion(kind: ConnectionKind): LiveSession {
    return { session: session('jump'), handle: null, kind };
  }

  const through: ReadonlyMap<string, CarriedOn> = new Map([
    ['web', { bastionId: 'jump', name: 'jump' }],
  ]);

  it('stops a carried host reading as one nothing has touched', () => {
    /* The whole of #168 in one assertion. The application is logged in to
       this host and its row used to say "saved, not connected". */
    const marked = markCarried([rider('connected', 4), bastion('saved')], through);

    expect(marked[1]?.kind).toBe('carrying');
  });

  it('leaves the bastion alone once it has a session of its own', () => {
    /* `connected` already admits the connection exists, which is what was
       being asked for. Replacing it would trade one silence for another. */
    const marked = markCarried([rider('connected', 4), bastion('connected')], through);

    expect(marked[1]?.kind).toBe('connected');
  });

  it('never covers a blocked host key', () => {
    /* The one substitution that could get somebody hurt: a security state
       painted over with a livelier marker because traffic is flowing. */
    const marked = markCarried([rider('connected', 4), bastion('keyMismatch')], through);

    expect(marked[1]?.kind).toBe('keyMismatch');
  });

  it('replaces a stale unreachable, because it is demonstrably reachable', () => {
    /* The verdict of an earlier direct attempt, contradicted by a session
       riding the host right now. */
    const marked = markCarried([rider('connected', 4), bastion('unreachable')], through);

    expect(marked[1]?.kind).toBe('carrying');
  });

  it('marks nothing for a session that has since closed', () => {
    /* The entry outlives the connection on purpose, so the handle is what
       decides. Otherwise closing the far session would leave the bastion
       claiming to carry it forever. */
    const marked = markCarried([rider('saved', null), bastion('saved')], through);

    expect(marked[1]?.kind).toBe('saved');
  });

  it('leaves the list untouched when nothing is riding anything', () => {
    const sessions = [rider('connected', 4), bastion('saved')];

    expect(markCarried(sessions, new Map())).toBe(sessions);
  });
});

describe('naming the host a session travels through', () => {
  const carried: CarriedOn = { bastionId: 'jump', name: 'old name' };

  it('uses the name the host has now', () => {
    /* Renaming a bastion has to rename it everywhere at once, including on
       the bar of a session that was already open. */
    const jump: Session = { ...session('jump'), name: 'new name' };

    expect(carrierName([jump], carried)).toBe('new name');
  });

  it('falls back to what the core reported when the host is gone', () => {
    /* Deleted while something was still riding it. The connection is still
       there and still has to be named. */
    expect(carrierName([], carried)).toBe('old name');
  });
});
