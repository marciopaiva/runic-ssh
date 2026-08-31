/**
 * Guards the tab strip once it holds four different kinds of thing.
 *
 * `tabs.ts` answers for the sessions and knows nothing about the SFTP tab,
 * the editor or the settings tab, which is the point: `openTabs` still
 * derives only from sessions. What is new is the seam between them, and a
 * seam in a keyboard ring fails silently: the arrow key does nothing, or
 * lands somewhere that no longer exists, and neither shows up in a
 * screenshot.
 *
 * The three used to be woven by hand, one branch per combination. A third
 * kind is what made that stop scaling, so the strip is built once as an
 * ordered list and every question is asked of that list. #127's SFTP tab is
 * the fourth, and it is the one most likely to collide with its own
 * session's tab: both carry the same `sessionId`, so `sameFocus` and
 * `tabElementId` telling them apart is the property this file exists to
 * pin down before a screen shows two tabs fighting over one DOM id.
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

const NONE: ReadonlySet<string> = new Set();

const SESSION = (sessionId: string): Focus => ({ kind: 'session', sessionId });
const SFTP = (sessionId: string): Focus => ({ kind: 'sftp', sessionId });
const NEW: Focus = { kind: 'editor', target: { kind: 'new' } };
const EDIT = (sessionId: string): Focus => ({
  kind: 'editor',
  target: { kind: 'existing', sessionId },
});
const SETTINGS: Focus = { kind: 'settings' };

const TABS = [tab('a'), tab('b')];

describe('building the strip', () => {
  it('is the sessions alone when nothing else is open', () => {
    expect(stripEntries(TABS, NONE, [], false)).toEqual([SESSION('a'), SESSION('b')]);
  });

  it('places an SFTP tab right after the session it belongs to', () => {
    /* Drawn beside the shell tab for the same host, not apart from it: the
       shape Sftp.dc.html draws and the reason this is not appended at the
       end the way the editor and settings are. */
    expect(stripEntries(TABS, new Set(['a']), [], false)).toEqual([
      SESSION('a'),
      SFTP('a'),
      SESSION('b'),
    ]);
  });

  it('puts the editor after the sessions and settings last', () => {
    /* Session tabs keep the sidebar's order at the front, so opening either of
       the other two never shifts one sideways under the pointer. */
    expect(stripEntries(TABS, NONE, [{ kind: 'new' }], true)).toEqual([
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
      stripEntries(
        [tab('a')],
        NONE,
        [{ kind: 'existing', sessionId: 'b' }, { kind: 'new' }],
        false,
      ),
    ).toEqual([SESSION('a'), EDIT('b'), NEW]);
  });

  it('is empty when there is nothing at all', () => {
    expect(stripEntries([], NONE, [], false)).toEqual([]);
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

  it('does not confuse a session with its own SFTP tab', () => {
    /* Same sessionId, different kind: the exact shape that would make a
       careless `sameFocus` say the two are one tab. */
    expect(sameFocus(SESSION('a'), SFTP('a'))).toBe(false);
  });

  it('separates two different sessions own SFTP tabs', () => {
    expect(sameFocus(SFTP('a'), SFTP('b'))).toBe(false);
  });

  it('matches the same session own SFTP tab', () => {
    expect(sameFocus(SFTP('a'), SFTP('a'))).toBe(true);
  });
});

describe('naming a tab uniquely in the DOM', () => {
  it('gives a session and its own SFTP tab different ids', () => {
    /* Both carry the same sessionId. A shared fallback here is two `role="tab"`
       buttons and two panels answering to one id, which breaks aria-controls
       for whichever kind loses. */
    expect(tabElementId(SESSION('a'))).not.toBe(tabElementId(SFTP('a')));
    expect(panelElementId(SESSION('a'))).not.toBe(panelElementId(SFTP('a')));
  });

  it('is stable for the same focus', () => {
    expect(tabElementId(SFTP('a'))).toBe(tabElementId(SFTP('a')));
  });
});

describe('reading the focus', () => {
  it('names the session when one is focused', () => {
    expect(focusedSession(SESSION('a'))).toBe('a');
  });

  it('names the session an SFTP tab belongs to', () => {
    /* A second view on the same session, not a second thing to be looking
       at: the sidebar highlights the host exactly as it would for the
       shell tab. */
    expect(focusedSession(SFTP('a'))).toBe('a');
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
  const FULL = stripEntries(TABS, NONE, [{ kind: 'new' }], true);

  it('leaves a focused tab alone while it is there', () => {
    expect(resolveFocus(FULL, SESSION('b'))).toEqual(SESSION('b'));
    expect(resolveFocus(FULL, NEW)).toEqual(NEW);
    expect(resolveFocus(FULL, SETTINGS)).toEqual(SETTINGS);
  });

  it('moves off a session whose host dropped the connection', () => {
    expect(resolveFocus(stripEntries([tab('a')], NONE, [], false), SESSION('gone'))).toEqual(
      SESSION('a'),
    );
  });

  it('moves off the editor once it is closed', () => {
    /* Saving a new host closes the editor, and nothing else would notice the
       focus is pointing at a tab that is gone. */
    expect(resolveFocus(stripEntries(TABS, NONE, [], false), NEW)).toEqual(SESSION('a'));
  });

  it('is nothing when the strip is empty', () => {
    expect(resolveFocus([], SETTINGS)).toBeNull();
  });
});

describe('moving along the strip', () => {
  const FULL = stripEntries(TABS, NONE, [{ kind: 'new' }], true);

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

  it('reaches a session own SFTP tab from the keyboard', () => {
    const withSftp = stripEntries(TABS, new Set(['a']), [], false);
    expect(focusAfter(withSftp, SESSION('a'), 1)).toEqual(SFTP('a'));
    expect(focusAfter(withSftp, SFTP('a'), 1)).toEqual(SESSION('b'));
  });

  it('stays put when it is the only tab', () => {
    const alone = stripEntries([], NONE, [{ kind: 'new' }], false);

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
  const FULL = stripEntries(TABS, NONE, [{ kind: 'new' }], true);

  it('falls to the neighbour on the right', () => {
    expect(focusAfterClosing(FULL, SESSION('a'))).toEqual(SESSION('b'));
  });

  it('falls to the left at the end of the strip', () => {
    expect(focusAfterClosing(FULL, SETTINGS)).toEqual(NEW);
  });

  it('is nothing when the last tab goes', () => {
    expect(focusAfterClosing(stripEntries([], NONE, [], true), SETTINGS)).toBeNull();
  });
});
