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

import {
  ALL_STATES,
  describeState,
  groupSessions,
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
