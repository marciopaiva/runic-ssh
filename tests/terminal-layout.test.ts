/**
 * Guards how the panel is divided and who ends up in which rectangle.
 *
 * Asserted without a DOM because the failures here are quiet ones: a session
 * drawn twice is two React children sharing a key, which is one xterm reusing
 * the other's, and a focused tab whose session is in no pane is a strip
 * pointing at something the panel is not showing.
 */

import { describe, expect, it } from 'vitest';

import {
  inputTargets,
  paneBoxes,
  paneCount,
  paneLabel,
  placeSession,
  resolveLayout,
} from '../src/features/terminal/layout';
import type { LayoutKind, Pane } from '../src/features/terminal/layout';
import type { Tab } from '../src/features/chrome/tabs';
import type { Session } from '../src/ipc';

function tab(sessionId: string): Tab {
  return { sessionId, title: sessionId, kind: 'password', handle: 1 } as unknown as Tab;
}

const KINDS: readonly LayoutKind[] = ['single', 'columns', 'rows', 'grid'];

describe('the rectangles', () => {
  it('gives one, two or four panes', () => {
    expect(paneCount('single')).toBe(1);
    expect(paneCount('columns')).toBe(2);
    expect(paneCount('rows')).toBe(2);
    expect(paneCount('grid')).toBe(4);
  });

  it('covers the panel exactly, whatever the shape', () => {
    /* A gap shows the panel background through it and reads as a rendering
       fault; an overlap puts one terminal over another. */
    for (const kind of KINDS) {
      const area = paneBoxes(kind).reduce((sum, box) => sum + box.width * box.height, 0);
      expect(area).toBe(100 * 100);
    }
  });

  it('keeps every pane inside the panel', () => {
    for (const kind of KINDS) {
      for (const box of paneBoxes(kind)) {
        expect(box.left + box.width).toBeLessThanOrEqual(100);
        expect(box.top + box.height).toBeLessThanOrEqual(100);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  it('reads left to right and then down', () => {
    /* The order slots are filled in, and the order a keyboard would walk. */
    const grid = paneBoxes('grid');
    expect(grid.map((box) => [box.left, box.top])).toEqual([
      [0, 0],
      [50, 0],
      [0, 50],
      [50, 50],
    ]);
  });
});

describe('resolving what is drawn', () => {
  const open = [tab('web-01'), tab('db-01'), tab('cache-01')];

  it('draws the sessions the slots name', () => {
    const panes = resolveLayout('columns', ['web-01', 'db-01'], open, 'web-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', 'db-01']);
  });

  it('empties a slot whose session is gone', () => {
    /* The host drops the connection and the tab leaves the strip without
       anybody clicking anything. */
    const panes = resolveLayout('columns', ['web-01', 'db-01'], [tab('web-01')], 'web-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', null]);
  });

  it('never draws one session in two panes', () => {
    const panes = resolveLayout('columns', ['web-01', 'web-01'], open, 'web-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', null]);
  });

  it('puts the focused session on screen when no slot holds it', () => {
    const panes = resolveLayout('columns', ['web-01', null], open, 'cache-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', 'cache-01']);
  });

  it('takes the freed slot rather than pushing a neighbour out', () => {
    /* db-01 dropped, focus moved to cache-01: cache-01 belongs in the hole
       db-01 left, not in web-01's rectangle. */
    const panes = resolveLayout(
      'columns',
      ['web-01', 'db-01'],
      [tab('web-01'), tab('cache-01')],
      'cache-01',
    );
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', 'cache-01']);
  });

  it('replaces the first pane when the layout is full', () => {
    const panes = resolveLayout('columns', ['web-01', 'db-01'], open, 'cache-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['cache-01', 'db-01']);
  });

  it('leaves the panes alone when the editor is focused', () => {
    /* `focusedSession` is null for the editor and for settings, and neither
       should disturb what the terminals are doing. */
    const panes = resolveLayout('columns', ['web-01', 'db-01'], open, null);
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', 'db-01']);
  });

  it('ignores slots past the end of the shape', () => {
    /* Going from 2x2 back to two columns leaves two ids nothing can draw. */
    const panes = resolveLayout('columns', ['a', 'b', 'c', 'd'], [tab('a'), tab('b')], 'a');
    expect(panes).toHaveLength(2);
    expect(panes.map((pane) => pane.sessionId)).toEqual(['a', 'b']);
  });

  it('pads a shape the slots are too short for', () => {
    /* And going the other way, from two columns to 2x2. */
    const panes = resolveLayout('grid', ['web-01'], open, 'web-01');
    expect(panes.map((pane) => pane.sessionId)).toEqual(['web-01', null, null, null]);
  });

  it('gives every pane a rectangle', () => {
    const panes = resolveLayout('grid', [], open, null);
    expect(panes.map((pane) => pane.box)).toEqual(paneBoxes('grid'));
  });
});

describe('picking a tab', () => {
  it('replaces the focused pane when the layout is full', () => {
    expect(placeSession(['web-01', 'db-01'], 1, 'cache-01')).toEqual(['web-01', 'cache-01']);
  });

  it('prefers an empty pane over the focused one', () => {
    /* An empty pane cannot be focused: focus points at a session and it has
       none. Without this it would be a rectangle asking to be filled with no
       way to fill it. */
    expect(placeSession(['web-01', null], 0, 'cache-01')).toEqual(['web-01', 'cache-01']);
  });

  it('fills the first empty pane when there are several', () => {
    expect(placeSession([null, null, null, null], 0, 'web-01')).toEqual([
      'web-01',
      null,
      null,
      null,
    ]);
  });

  it('moves nothing when the session is already on screen', () => {
    /* Reaching for a terminal you can already see must not rearrange the
       ones beside it. Identity, so React sees no change at all. */
    const slots = ['web-01', 'db-01'];
    expect(placeSession(slots, 0, 'db-01')).toBe(slots);
  });

  it('leaves a full layout alone when the focus is not on a pane', () => {
    /* The editor or the settings tab is focused, so there is no pane to
       replace and no empty one to fill. */
    const slots = ['web-01', 'db-01'];
    expect(placeSession(slots, -1, 'cache-01')).toBe(slots);
    expect(placeSession(slots, 5, 'cache-01')).toBe(slots);
  });
});

describe('where a keystroke goes', () => {
  const WHOLE = { left: 0, top: 0, width: 100, height: 100 };

  function panes(...ids: readonly (string | null)[]): readonly Pane[] {
    return ids.map((sessionId, at) => ({ sessionId, box: paneBoxes('grid')[at] ?? WHOLE }));
  }

  it('reaches one host with the switch off', () => {
    expect(inputTargets(panes('web-01', 'db-01'), 'web-01', false)).toEqual(['web-01']);
  });

  it('reaches every pane with the switch on', () => {
    expect(inputTargets(panes('web-01', 'db-01'), 'web-01', true)).toEqual([
      'web-01',
      'db-01',
    ]);
  });

  it('skips an empty pane', () => {
    expect(inputTargets(panes('web-01', null), 'web-01', true)).toEqual(['web-01']);
  });

  it('refuses to broadcast from a terminal that is not on screen', () => {
    /* It should not be able to receive a keystroke at all, being hidden and
       `pointer-events-none`. The whole point of this switch is that the blast
       radius is more than one host, so "should not happen" does not earn it. */
    expect(inputTargets(panes('web-01', 'db-01'), 'cache-01', true)).toEqual(['cache-01']);
  });

  it('sends nowhere twice', () => {
    const targets = inputTargets(panes('web-01', 'db-01', 'cache-01', 'web-02'), 'db-01', true);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe('how a pane names its session', () => {
  function saved(over: Partial<Session> = {}): Session {
    return {
      id: 'a1',
      name: 'web-01',
      host: '10.0.4.12',
      port: 22,
      user: 'deploy',
      group: null,
      credentialId: null,
      ...over,
    };
  }

  it('carries the saved name and who it connects as', () => {
    /* With four panes the shell prompt is otherwise the only thing on screen
       saying which host a rectangle is, and a prompt says whatever the remote
       host put in PS1. */
    expect(paneLabel(saved())).toEqual({ name: 'web-01', where: 'deploy@10.0.4.12' });
  });

  it('shows a port that is not the default', () => {
    expect(paneLabel(saved({ port: 2222 })).where).toBe('deploy@10.0.4.12:2222');
  });

  it('leaves out port 22', () => {
    /* On every row and carrying no information, it would push the part that
       does identify the host along by three characters in every pane. */
    expect(paneLabel(saved()).where).not.toContain('22');
  });
});
