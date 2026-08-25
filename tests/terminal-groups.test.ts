/**
 * Guards the group model ADR-0020 chose.
 *
 * Everything here is invisible until somebody is looking at four hosts at once,
 * which is the worst moment to find out that a rectangle is showing the wrong
 * one or that a keystroke went somewhere nobody armed. The old suite this
 * replaces held the same line for slots; the properties are carried over
 * deliberately rather than rewritten from the new shape, so that what a slot
 * proved a group still proves.
 *
 * One of them is new. A session sitting behind another in the same group is
 * connected and is not receiving, which slots could not express and which is
 * the rule most likely to be got wrong.
 */

import { describe, expect, it } from 'vitest';

import {
  activeEntry,
  gridBoxes,
  gridCount,
  groupOf,
  inputTargets,
  moveEntry,
  placeEntry,
  receivingSessions,
  removeEntry,
  resolveGroups,
} from '../src/features/terminal/groups';
import type { HeldGroup } from '../src/features/terminal/groups';
import type { Focus } from '../src/features/chrome/focus';

const NONE: ReadonlySet<string> = new Set();

function session(id: string): Focus {
  return { kind: 'session', sessionId: id };
}

const SETTINGS: Focus = { kind: 'settings' };

function editor(id: string): Focus {
  return { kind: 'editor', target: { kind: 'existing', sessionId: id } };
}

/** A held layout from a list per group, active on the first of each. */
function held(...groups: readonly Focus[][]): readonly HeldGroup[] {
  return groups.map((entries) => ({ entries, activeAt: entries.length > 0 ? 0 : -1 }));
}

function ids(groups: readonly HeldGroup[]): readonly (readonly string[])[] {
  return groups.map((group) =>
    group.entries.map((entry) => (entry.kind === 'session' ? entry.sessionId : entry.kind)),
  );
}

describe('the grid', () => {
  it('gives every shape boxes that cover the area exactly once', () => {
    for (const grid of ['single', 'columns', 'rows', 'grid'] as const) {
      const area = gridBoxes(grid).reduce((sum, box) => sum + box.width * box.height, 0);
      expect(area, grid).toBe(100 * 100);
    }
  });

  it('counts what it draws', () => {
    expect(gridCount('single')).toBe(1);
    expect(gridCount('columns')).toBe(2);
    expect(gridCount('rows')).toBe(2);
    expect(gridCount('grid')).toBe(4);
  });
});

describe('resolving what is drawn', () => {
  it('keeps entries where they were put', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01'), session('web-02')], [session('db-01')]),
      [session('web-01'), session('web-02'), session('db-01')],
      session('web-01'),
    );

    expect(ids(groups)).toEqual([['web-01', 'web-02'], ['db-01']]);
  });

  it('drops a session that is no longer open', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01'), session('gone')], [session('db-01')]),
      [session('web-01'), session('db-01')],
      session('web-01'),
    );

    expect(ids(groups)).toEqual([['web-01'], ['db-01']]);
  });

  /* Two React children with one key is one xterm silently reusing the other's,
     and the symptom is a terminal showing another host's scrollback. */
  it('never puts one entry in two groups', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01')], [session('web-01')]),
      [session('web-01')],
      session('web-01'),
    );

    expect(ids(groups)).toEqual([['web-01'], []]);
  });

  /* A strip highlighting something the area is not showing is worse than no
     split at all: the person reaches for a terminal that is not there. */
  it('makes the focused entry the active tab of its group', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01'), session('web-02')], [session('db-01')]),
      [session('web-01'), session('web-02'), session('db-01')],
      session('web-02'),
    );

    expect(activeEntry(groups[0] as HeldGroup)).toEqual(session('web-02'));
    expect(groupOf(groups, session('web-02'))).toBe(0);
  });

  it('leaves the other groups showing what they were showing', () => {
    const groups = resolveGroups(
      'columns',
      [
        { entries: [session('web-01'), session('web-02')], activeAt: 1 },
        { entries: [session('db-01'), session('db-02')], activeAt: 1 },
      ],
      [session('web-01'), session('web-02'), session('db-01'), session('db-02')],
      session('web-02'),
    );

    expect(activeEntry(groups[1] as HeldGroup)).toEqual(session('db-02'));
  });

  it('falls back to the first tab when the active one closes', () => {
    const groups = resolveGroups(
      'single',
      [{ entries: [session('web-01'), session('gone')], activeAt: 1 }],
      [session('web-01')],
      null,
    );

    expect(activeEntry(groups[0] as HeldGroup)).toEqual(session('web-01'));
  });

  it('reports an empty group rather than pretending it holds something', () => {
    const groups = resolveGroups('columns', held([session('web-01')], []), [session('web-01')], null);

    expect(groups[1]?.entries).toEqual([]);
    expect(groups[1]?.activeAt).toBe(-1);
    expect(activeEntry(groups[1] as HeldGroup)).toBeNull();
  });

  /* Nothing open may be running with no rectangle to be seen in. Before this
     an entry no group claimed simply vanished from the screen while its
     connection stayed up. */
  it('gives an unclaimed entry a home in the focused group', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01')], [session('db-01')]),
      [session('web-01'), session('db-01'), session('new')],
      session('db-01'),
    );

    expect(ids(groups)).toEqual([['web-01'], ['db-01', 'new']]);
  });

  it('falls back to the first group when the focus is the unclaimed one', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01')], []),
      [session('web-01'), session('new')],
      session('new'),
    );

    expect(ids(groups)).toEqual([['web-01', 'new'], []]);
  });

  /* A host form and the settings surface are tabs like any other, which is
     what makes ADR-0017 survive ADR-0020 without an edit. */
  it('holds a host form and settings the same way it holds a session', () => {
    const groups = resolveGroups(
      'columns',
      held([session('web-01'), editor('web-02')], [SETTINGS]),
      [session('web-01'), editor('web-02'), SETTINGS],
      SETTINGS,
    );

    expect(ids(groups)).toEqual([['web-01', 'editor'], ['settings']]);
    expect(activeEntry(groups[1] as HeldGroup)).toEqual(SETTINGS);
  });

  it('drops entries that do not fit the shape', () => {
    const groups = resolveGroups(
      'single',
      held([session('web-01')], [session('db-01')]),
      [session('web-01'), session('db-01')],
      session('web-01'),
    );

    /* One box, so db-01 is unclaimed and joins the focused group rather than
       disappearing with the rectangle that used to hold it. */
    expect(ids(groups)).toEqual([['web-01', 'db-01']]);
  });
});

describe('putting something on screen', () => {
  it('moves nothing when it is already there', () => {
    const before = held([session('web-01')], [session('db-01')]);
    expect(placeEntry(before, 0, session('db-01'))).toBe(before);
  });

  /* A group holds a list, so arriving does not evict. That is the difference
     from slots, where filling a rectangle threw out whatever held it. */
  it('joins the focused group without pushing anything out', () => {
    const after = placeEntry(held([session('web-01')], [session('db-01')]), 1, session('new'));

    expect(ids(after)).toEqual([['web-01'], ['db-01', 'new']]);
    expect(after[1]?.activeAt).toBe(1);
  });

  it('falls back to the first group when the focused index is not one', () => {
    const after = placeEntry(held([session('web-01')], []), -1, session('new'));
    expect(ids(after)).toEqual([['web-01', 'new'], []]);
  });
});

describe('where a keystroke goes', () => {
  const two = held([session('web-01')], [session('web-02')]);

  it('reaches only the terminal that produced it when the switch is off', () => {
    expect(inputTargets(two, 'web-01', false, NONE)).toEqual(['web-01']);
  });

  it('reaches every group that is showing a session when it is armed', () => {
    expect(inputTargets(two, 'web-01', true, NONE)).toEqual(['web-01', 'web-02']);
  });

  /* One receiving session would send exactly where an unarmed keystroke goes
     while the screen claimed something was happening. */
  it('is not a broadcast when only one would receive', () => {
    expect(inputTargets(held([session('web-01')], []), 'web-01', true, NONE)).toEqual(['web-01']);
  });

  it('refuses to send from a terminal that is not itself receiving', () => {
    expect(inputTargets(two, 'cache-01', true, NONE)).toEqual(['cache-01']);
  });

  it('leaves out a group turned off in its own strip', () => {
    const three = held([session('web-01')], [session('web-02')], [session('db-01')]);
    expect(inputTargets(three, 'web-01', true, new Set(['db-01']))).toEqual(['web-01', 'web-02']);
  });

  /* THE RULE ADR-0020 INTRODUCED. web-02 is connected, in the same group as
     web-01, and behind it. A group contributes what it is showing and nothing
     else, so a background tab is not a destination. Getting this wrong sends a
     command to a host whose terminal nobody can see. */
  it('does not reach a session sitting in a group behind another', () => {
    const stacked = held([session('web-01'), session('web-02')], [session('db-01')]);

    expect(receivingSessions(stacked, NONE)).toEqual(['web-01', 'db-01']);
    expect(inputTargets(stacked, 'web-01', true, NONE)).toEqual(['web-01', 'db-01']);
  });

  it('will not send from a background tab either', () => {
    const stacked = held([session('web-01'), session('web-02')], [session('db-01')]);
    expect(inputTargets(stacked, 'web-02', true, NONE)).toEqual(['web-02']);
  });

  /* A host form has no host to type into, and settings has no host at all. */
  it('counts only sessions, never a form or the settings surface', () => {
    const mixed = held([session('web-01')], [SETTINGS], [editor('web-02')]);
    expect(receivingSessions(mixed, NONE)).toEqual(['web-01']);
    expect(inputTargets(mixed, 'web-01', true, NONE)).toEqual(['web-01']);
  });

  it('counts nothing from an empty group', () => {
    expect(receivingSessions(held([session('web-01')], []), NONE)).toEqual(['web-01']);
  });
});

describe('finding a group', () => {
  it('says which one holds an entry', () => {
    const groups = held([session('web-01')], [session('db-01')]);
    expect(groupOf(groups, session('db-01'))).toBe(1);
  });

  it('says nothing holds it rather than guessing', () => {
    expect(groupOf(held([session('web-01')]), session('missing'))).toBe(-1);
    expect(groupOf(held([session('web-01')]), null)).toBe(-1);
  });
});

describe('taking something off a strip', () => {
  it('removes the entry from the group that held it', () => {
    const after = removeEntry(held([session('a'), session('b')], [session('c')]), session('b'));

    expect(ids(after)).toEqual([['a'], ['c']]);
  });

  it('leaves a group that never held it alone', () => {
    const before = held([session('a')], [session('b')]);
    const after = removeEntry(before, session('z'));

    expect(ids(after)).toEqual(ids(before));
  });

  it('empties a group down to no active entry', () => {
    const after = removeEntry(held([session('a')]), session('a'));

    expect(after[0]?.entries).toEqual([]);
    expect(after[0]?.activeAt).toBe(-1);
  });

  it('goes on showing what it was showing when another tab leaves', () => {
    /* Closing a background tab must not move the one on screen. Somebody
       dismissing a form they are not looking at should not lose their place. */
    const before = [{ entries: [session('a'), session('b'), session('c')], activeAt: 2 }];
    const after = removeEntry(before, session('a'));

    expect(activeEntry(after[0] ?? { entries: [], activeAt: -1 })).toEqual(session('c'));
  });

  it('falls to the neighbour on the right when the shown tab leaves', () => {
    const before = [{ entries: [session('a'), session('b'), session('c')], activeAt: 1 }];
    const after = removeEntry(before, session('b'));

    expect(activeEntry(after[0] ?? { entries: [], activeAt: -1 })).toEqual(session('c'));
  });

  it('falls to the left when the shown tab was the last one', () => {
    const before = [{ entries: [session('a'), session('b')], activeAt: 1 }];
    const after = removeEntry(before, session('b'));

    expect(activeEntry(after[0] ?? { entries: [], activeAt: -1 })).toEqual(session('a'));
  });

  it('forgets a form so reopening it lands where the work is', () => {
    /* The reason this function exists. `placeEntry` refuses to move something
       a group already holds, so a closed tab left behind would come back in a
       rectangle nobody chose. */
    const closed = removeEntry(held([session('a'), editor('x')], [session('b')]), editor('x'));
    const reopened = placeEntry(closed, 1, editor('x'));

    expect(ids(reopened)).toEqual([['a'], ['b', 'editor']]);
  });

  it('takes settings off the strip the same way', () => {
    const after = removeEntry(held([session('a'), SETTINGS]), SETTINGS);

    expect(ids(after)).toEqual([['a']]);
  });
});

describe('sending a tab to another group', () => {
  it('takes it out of the group it was in', () => {
    const after = moveEntry(held([session('a'), session('b')], [session('c')]), session('b'), 1);

    expect(ids(after)).toEqual([['a'], ['c', 'b']]);
  });

  it('shows what was moved, or the move is invisible', () => {
    const after = moveEntry(held([session('a'), session('b')], [session('c')]), session('b'), 1);

    expect(activeEntry(after[1] ?? { entries: [], activeAt: -1 })).toEqual(session('b'));
  });

  it('leaves the group it left showing something', () => {
    const before = [
      { entries: [session('a'), session('b')], activeAt: 1 },
      { entries: [session('c')], activeAt: 0 },
    ];
    const after = moveEntry(before, session('b'), 1);

    expect(activeEntry(after[0] ?? { entries: [], activeAt: -1 })).toEqual(session('a'));
  });

  it('does nothing when it is already there', () => {
    const before = held([session('a')], [session('b')]);

    expect(moveEntry(before, session('b'), 1)).toBe(before);
  });

  it('refuses a group that does not exist', () => {
    const before = held([session('a')], [session('b')]);

    expect(moveEntry(before, session('a'), 4)).toBe(before);
    expect(moveEntry(before, session('a'), -1)).toBe(before);
  });

  it('never leaves the same tab in two rectangles', () => {
    /* Two React children with one key is one xterm silently reusing another's,
       which is the property the whole model is arranged around. */
    const after = moveEntry(held([session('a'), session('b')], [session('c')]), session('a'), 1);
    const seen = after.flatMap((group) => group.entries.map((entry) => JSON.stringify(entry)));

    expect(new Set(seen).size).toBe(seen.length);
  });

  it('moves a host form the same way it moves a session', () => {
    const after = moveEntry(held([editor('x')], [session('a')]), editor('x'), 1);

    expect(ids(after)).toEqual([[], ['a', 'editor']]);
  });

  it('empties the group it was the only tab of', () => {
    const after = moveEntry(held([session('a')], [session('b')]), session('a'), 1);

    expect(after[0]?.activeAt).toBe(-1);
  });
});
