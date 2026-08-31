/**
 * Guards the tab strip once it holds three different kinds of thing.
 *
 * `tabs.ts` answers for the sessions and knows nothing about the editor or
 * the settings tab, which is the point: `openTabs` still derives only from
 * sessions. What is new is the seam between them, and a seam in a keyboard
 * ring fails silently: the arrow key does nothing, or lands somewhere that
 * no longer exists, and neither shows up in a screenshot.
 *
 * SFTP used to be a fourth kind here, sharing a `sessionId` with its own
 * session's tab. ADR-0044 gave it its own workspace with its own, simpler
 * state instead, so this file goes back to guarding the three ADR-0029 left
 * it with.
 */

import { describe, expect, it } from 'vitest';

import {
  focusAfter,
  focusAfterClosing,
  focusedSession,
  panelElementId,
  resolveFocus,
  sameFocus,
  stripEntries,
  tabElementId,
} from '../src/features/chrome/focus';
import type { Focus } from '../src/features/chrome/focus';
import type { Tab } from '../src/features/chrome/tabs';

function tab(sessionId: string): Tab {
  return { sessionId, title: sessionId, kind: 'connected', handle: 1 };
}

const SESSION = (sessionId: string): Focus => ({ kind: 'session', sessionId });
const NEW: Focus = { kind: 'editor', target: { kind: 'new' } };
const EDIT = (sessionId: string): Focus => ({
  kind: 'editor',
  target: { kind: 'existing', sessionId },
});
const SETTINGS: Focus = { kind: 'settings' };

const TABS = [tab('a'), tab('b')];

describe('building the strip', () => {
  it('is the sessions alone when nothing else is open', () => {
    expect(stripEntries(TABS, [], false)).toEqual([SESSION('a'), SESSION('b')]);
  });

  it('puts the editor after the sessions and settings last', () => {
    /* Session tabs keep the sidebar's order at the front, so opening either of
       the other two never shifts one sideways under the pointer. */
    expect(stripEntries(TABS, [{ kind: 'new' }], true)).toEqual([
      SESSION('a'),
      SESSION('b'),
      NEW,
      SETTINGS,
    ]);
  });

  it('keeps one entry per open form, in the order they were opened', () => {
    /* One tab per host is what makes the unsaved question belong to a host
       rather than to a shared form — the shape #96 recorded and parked. */
    expect(
      stripEntries([tab('a')], [{ kind: 'existing', sessionId: 'b' }, { kind: 'new' }], false),
    ).toEqual([SESSION('a'), EDIT('b'), NEW]);
  });

  it('is empty when there is nothing at all', () => {
    expect(stripEntries([], [], false)).toEqual([]);
  });
});

describe('telling two tabs apart', () => {
  it('separates the new-session editor from an existing host', () => {
    /* The editor carries its target rather than a reserved id. `'new'` as a
       magic session id is the sentinel `focus.ts` exists to avoid. */
    expect(sameFocus(NEW, EDIT('a'))).toBe(false);
  });

  it('separates two hosts being edited', () => {
    expect(sameFocus(EDIT('a'), EDIT('b'))).toBe(false);
  });

  it('matches the same host', () => {
    expect(sameFocus(EDIT('a'), EDIT('a'))).toBe(true);
  });

  it('does not confuse a session with the editor on that session', () => {
    expect(sameFocus(SESSION('a'), EDIT('a'))).toBe(false);
  });
});

describe('naming a tab uniquely in the DOM', () => {
  it('is stable for the same focus', () => {
    expect(tabElementId(SESSION('a'))).toBe(tabElementId(SESSION('a')));
  });

  it('differs between two sessions', () => {
    expect(tabElementId(SESSION('a'))).not.toBe(tabElementId(SESSION('b')));
    expect(panelElementId(SESSION('a'))).not.toBe(panelElementId(SESSION('b')));
  });
});

describe('reading the focus', () => {
  it('names the session when one is focused', () => {
    expect(focusedSession(SESSION('a'))).toBe('a');
  });

  it('names no session while the editor or settings is focused', () => {
    /* The terminals key their visibility off this. An editor tab that still
       reported a session id would leave a terminal drawn under the form. */
    expect(focusedSession(EDIT('a'))).toBeNull();
    expect(focusedSession(SETTINGS)).toBeNull();
    expect(focusedSession(null)).toBeNull();
  });
});

describe('keeping the focus on something that exists', () => {
  const FULL = stripEntries(TABS, [{ kind: 'new' }], true);

  it('leaves a focused tab alone while it is there', () => {
    expect(resolveFocus(FULL, SESSION('b'))).toEqual(SESSION('b'));
    expect(resolveFocus(FULL, NEW)).toEqual(NEW);
    expect(resolveFocus(FULL, SETTINGS)).toEqual(SETTINGS);
  });

  it('moves off a session whose host dropped the connection', () => {
    expect(resolveFocus(stripEntries([tab('a')], [], false), SESSION('gone'))).toEqual(
      SESSION('a'),
    );
  });

  it('moves off the editor once it is closed', () => {
    /* Saving a new host closes the editor, and nothing else would notice the
       focus is pointing at a tab that is gone. */
    expect(resolveFocus(stripEntries(TABS, [], false), NEW)).toEqual(SESSION('a'));
  });

  it('is nothing when the strip is empty', () => {
    expect(resolveFocus([], SETTINGS)).toBeNull();
  });
});

describe('moving along the strip', () => {
  const FULL = stripEntries(TABS, [{ kind: 'new' }], true);

  it('steps and wraps through every kind', () => {
    expect(focusAfter(FULL, SESSION('b'), 1)).toEqual(NEW);
    expect(focusAfter(FULL, NEW, 1)).toEqual(SETTINGS);
    expect(focusAfter(FULL, SETTINGS, 1)).toEqual(SESSION('a'));
    expect(focusAfter(FULL, SESSION('a'), -1)).toEqual(SETTINGS);
  });

  it('reaches the editor from the keyboard', () => {
    /* The whole reason it is in the ring rather than beside it: a tab that
       only the mouse can reach is a tab a keyboard user does not have. */
    expect(focusAfter(FULL, NEW, -1)).toEqual(SESSION('b'));
  });

  it('stays put when it is the only tab', () => {
    const alone = stripEntries([], [{ kind: 'new' }], false);

    expect(focusAfter(alone, NEW, 1)).toEqual(NEW);
    expect(focusAfter(alone, NEW, -1)).toEqual(NEW);
  });

  it('starts somewhere when nothing is focused', () => {
    expect(focusAfter(FULL, null, 1)).toEqual(SESSION('a'));
  });

  it('has nowhere to go with an empty strip', () => {
    expect(focusAfter([], null, 1)).toBeNull();
  });

  it('visits every tab exactly once before repeating', () => {
    /* A ring that skips one or lands on the same tab twice is the failure this
       module exists to prevent, and stepping it is the only way to see it. */
    const seen: Focus[] = [];
    let focus: Focus | null = SESSION('a');

    for (let step = 0; step < FULL.length; step += 1) {
      if (focus !== null) seen.push(focus);
      focus = focusAfter(FULL, focus, 1);
    }

    expect(seen).toEqual(FULL);
    expect(focus).toEqual(SESSION('a'));
  });
});

describe('what takes over when a tab closes', () => {
  const FULL = stripEntries(TABS, [{ kind: 'new' }], true);

  it('falls to the neighbour on the right', () => {
    expect(focusAfterClosing(FULL, SESSION('a'))).toEqual(SESSION('b'));
  });

  it('falls to the left at the end of the strip', () => {
    expect(focusAfterClosing(FULL, SETTINGS)).toEqual(NEW);
  });

  it('is nothing when the last tab goes', () => {
    expect(focusAfterClosing(stripEntries([], [], true), SETTINGS)).toBeNull();
  });
});
