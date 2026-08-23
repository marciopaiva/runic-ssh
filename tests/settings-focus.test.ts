/**
 * Guards the tab strip once it holds two different kinds of thing.
 *
 * `tabs.ts` answers for the sessions and knows nothing about settings, which
 * is the point — `openTabs` still derives only from sessions. What is new is
 * the seam between them, and a seam in a keyboard ring fails silently: the
 * arrow key does nothing, or lands somewhere that no longer exists, and
 * neither shows up in a screenshot.
 */

import { describe, expect, it } from 'vitest';

import { focusAfter, focusedSession, resolveFocus } from '../src/features/chrome/focus';
import type { Focus } from '../src/features/chrome/focus';
import type { Tab } from '../src/features/chrome/tabs';

function tab(sessionId: string): Tab {
  return { sessionId, title: sessionId, kind: 'connected', handle: 1 };
}

const SESSION = (sessionId: string): Focus => ({ kind: 'session', sessionId });
const SETTINGS: Focus = { kind: 'settings' };

const TABS = [tab('a'), tab('b')];

describe('reading the focus', () => {
  it('names the session when one is focused', () => {
    expect(focusedSession(SESSION('a'))).toBe('a');
  });

  it('names no session while settings is focused', () => {
    /* The terminals key their visibility off this. A settings tab that still
       reported a session id would leave a terminal drawn under the panel. */
    expect(focusedSession(SETTINGS)).toBeNull();
    expect(focusedSession(null)).toBeNull();
  });
});

describe('keeping the focus on something that exists', () => {
  it('leaves a focused session alone while its tab is there', () => {
    expect(resolveFocus(TABS, false, SESSION('b'))).toEqual(SESSION('b'));
  });

  it('moves off a session whose host dropped the connection', () => {
    expect(resolveFocus([tab('a')], false, SESSION('gone'))).toEqual(SESSION('a'));
  });

  it('leaves settings alone while it is open', () => {
    expect(resolveFocus(TABS, true, SETTINGS)).toEqual(SETTINGS);
  });

  it('moves off settings once it is closed', () => {
    /* Closing settings from the palette is not a click on the strip, so
       nothing else would notice the focus is pointing at a tab that is gone. */
    expect(resolveFocus(TABS, false, SETTINGS)).toEqual(SESSION('a'));
  });

  it('falls back to settings when it is all that is left', () => {
    expect(resolveFocus([], true, SESSION('gone'))).toEqual(SETTINGS);
  });

  it('is nothing when the strip is empty', () => {
    expect(resolveFocus([], false, SETTINGS)).toBeNull();
  });
});

describe('moving along the strip', () => {
  it('steps between sessions when settings is closed', () => {
    expect(focusAfter(TABS, false, SESSION('a'), 1)).toEqual(SESSION('b'));
    expect(focusAfter(TABS, false, SESSION('b'), -1)).toEqual(SESSION('a'));
  });

  it('wraps between sessions when settings is closed', () => {
    expect(focusAfter(TABS, false, SESSION('b'), 1)).toEqual(SESSION('a'));
    expect(focusAfter(TABS, false, SESSION('a'), -1)).toEqual(SESSION('b'));
  });

  it('reaches settings at the end of the ring', () => {
    /* The whole reason settings is in the ring rather than beside it: a tab
       that only the mouse can reach is a tab a keyboard user does not have. */
    expect(focusAfter(TABS, true, SESSION('b'), 1)).toEqual(SETTINGS);
  });

  it('wraps from settings back to the first session', () => {
    expect(focusAfter(TABS, true, SETTINGS, 1)).toEqual(SESSION('a'));
  });

  it('reaches settings backwards from the first session', () => {
    expect(focusAfter(TABS, true, SESSION('a'), -1)).toEqual(SETTINGS);
  });

  it('steps backwards from settings to the last session', () => {
    expect(focusAfter(TABS, true, SETTINGS, -1)).toEqual(SESSION('b'));
  });

  it('stays on settings when it is the only tab', () => {
    expect(focusAfter([], true, SETTINGS, 1)).toEqual(SETTINGS);
    expect(focusAfter([], true, SETTINGS, -1)).toEqual(SETTINGS);
  });

  it('starts somewhere when nothing is focused', () => {
    expect(focusAfter(TABS, true, null, 1)).toEqual(SESSION('a'));
    expect(focusAfter(TABS, false, null, 1)).toEqual(SESSION('a'));
  });

  it('has nowhere to go with an empty strip', () => {
    expect(focusAfter([], false, null, 1)).toBeNull();
  });

  it('visits every tab exactly once before repeating', () => {
    /* A ring that skips one or lands on the same tab twice is the failure
       this whole module exists to prevent, and stepping it is the only way to
       see it. */
    const seen: string[] = [];
    let focus: Focus | null = SESSION('a');

    for (let step = 0; step < 3; step += 1) {
      seen.push(focus?.kind === 'settings' ? 'settings' : (focusedSession(focus) ?? '?'));
      focus = focusAfter(TABS, true, focus, 1);
    }

    expect(seen).toEqual(['a', 'b', 'settings']);
    expect(focus).toEqual(SESSION('a'));
  });
});
