/**
 * Guards the window chrome.
 *
 * ADR-0005 named the risk in its own Decision: two chrome implementations and
 * a per-platform inset, "in a surface that is purely cosmetic and therefore
 * easy to under-test". The per-platform part is data rather than markup for
 * exactly this reason — what the titlebar draws can be asserted without a
 * window to look at.
 */

import { describe, expect, it } from 'vitest';

import { windowControls } from '../src/features/chrome/controls';
import { openTabs, resolveActive, tabAfter, tabAfterClosing } from '../src/features/chrome/tabs';
import type { Tab } from '../src/features/chrome/tabs';
import type { LiveSession } from '../src/features/sessions';
import type { Session } from '../src/ipc';

const MACOS = {
  controls: 'system',
  leadingInset: 78,
  commandModifier: 'meta',
  nativeDecorations: false,
} as const;
const UNDECORATED = {
  controls: 'application',
  leadingInset: 0,
  commandModifier: 'control',
  nativeDecorations: false,
} as const;

/* ADR-0005's escape hatch: the window manager draws the bar above ours, so it
   owns the controls and nothing overlaps us. `system` with a zero inset, which
   is the pair MACOS gets wrong in exactly one field. */
const NATIVE = {
  controls: 'system',
  leadingInset: 0,
  commandModifier: 'control',
  nativeDecorations: true,
} as const;

function session(id: string, name: string): Session {
  return {
    id,
    name,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
  };
}

function live(
  id: string,
  kind: LiveSession['kind'],
  handle: number | null = null,
): LiveSession {
  return { session: session(id, id), handle, kind };
}

function tab(id: string): Tab {
  return { sessionId: id, title: id, kind: 'connected', handle: 1 };
}

describe('window controls', () => {
  it('draws none where the system draws its own', () => {
    /* Drawing a second set beside the traffic lights is the outcome ADR-0005
       chose Option C to avoid. */
    expect(windowControls(MACOS, false)).toEqual([]);
    expect(windowControls(MACOS, true)).toEqual([]);
  });

  it('draws all three where the window has no decorations', () => {
    const actions = windowControls(UNDECORATED, false).map((control) => control.action);

    expect(actions).toEqual(['minimize', 'maximize', 'close']);
  });

  it('draws none once the window manager has its title bar back', () => {
    /* ADR-0005's escape hatch, and the failure it guards against is visible
       rather than subtle: a real title bar with minimise, maximise and close,
       and a second set of ours drawn directly underneath it. */
    expect(windowControls(NATIVE, false)).toEqual([]);
    expect(windowControls(NATIVE, true)).toEqual([]);
  });

  it('reserves leading space for the overlay and for nothing else', () => {
    /* MACOS and NATIVE both say `system`, and only one of them has anything
       floating over our bar. Reading `controls` alone would put 78 pixels of
       nothing at the start of the tab strip. */
    expect(MACOS.leadingInset).toBeGreaterThan(0);
    expect(NATIVE.leadingInset).toBe(0);
    expect(UNDECORATED.leadingInset).toBe(0);
  });

  it('offers to restore a maximized window rather than maximize it again', () => {
    const actions = windowControls(UNDECORATED, true).map((control) => control.action);

    expect(actions).toEqual(['minimize', 'restore', 'close']);
  });

  it('marks only the control that loses the window', () => {
    const destructive = windowControls(UNDECORATED, false)
      .filter((control) => control.destructive)
      .map((control) => control.action);

    expect(destructive).toEqual(['close']);
  });

  it('gives every control a label of its own', () => {
    const labels = windowControls(UNDECORATED, false).map((control) => control.label);

    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('session tabs', () => {
  it('gives a tab to an open connection', () => {
    expect(openTabs([live('a', 'connected', 7)], null).map((t) => t.sessionId)).toEqual(['a']);
  });

  it('gives a tab to one still connecting', () => {
    /* The tab is where the failure will be reported. Waiting for the handle
       means a connection that never completes has nowhere to say so. */
    expect(openTabs([live('a', 'connecting')], null).map((t) => t.sessionId)).toEqual(['a']);
  });

  it('gives no tab to a host nobody has connected to', () => {
    /* A saved host is a row in the sidebar. A tab that cannot be switched to
       is a lie about what is open. */
    expect(openTabs([live('a', 'saved'), live('b', 'unreachable')], null)).toEqual([]);
  });

  it('keeps the order the sidebar lists them in', () => {
    const tabs = openTabs(
      [live('a', 'connected', 1), live('b', 'connecting'), live('c', 'connected', 2)],
      null,
    );

    expect(tabs.map((t) => t.sessionId)).toEqual(['a', 'b', 'c']);
  });
});

describe('the tab a question is waiting in', () => {
  /* ADR-0015 renders a host key prompt and a connection failure inside the
     panel of the session they are about. A session with no tab has no panel,
     so losing the tab loses the surface — which is exactly what happened
     before: failing flipped the session to `unreachable`, the filter dropped
     it, and the only place the failure could be shown went with it. */

  it('keeps the tab of a session whose attempt failed', () => {
    expect(openTabs([live('a', 'unreachable')], 'a').map((t) => t.sessionId)).toEqual(['a']);
  });

  it('keeps the tab of a session waiting on a host key decision', () => {
    expect(openTabs([live('a', 'keyMismatch')], 'a').map((t) => t.sessionId)).toEqual(['a']);
  });

  it('drops the tab once the attempt is let go', () => {
    /* Dismissing the failure clears the attempt. Without this the tab of a
       host that never connected would stay on the strip for the session. */
    expect(openTabs([live('a', 'unreachable')], null)).toEqual([]);
  });

  it('holds the tab of the session under attention and no other', () => {
    const tabs = openTabs([live('a', 'unreachable'), live('b', 'unreachable')], 'b');

    expect(tabs.map((t) => t.sessionId)).toEqual(['b']);
  });

  it('does not give a second tab to a session that already has one', () => {
    /* The attempt names a session that may also be connected — retrying from
       the failure surface is exactly that. Two tabs for one session would
       break every lookup that assumes the id is unique on the strip. */
    const tabs = openTabs([live('a', 'connected', 3)], 'a');

    expect(tabs.map((t) => t.sessionId)).toEqual(['a']);
  });

  it('reports the state the session is actually in', () => {
    /* The marker is what tells a background tab that something is waiting in
       it, now that no backdrop does. A tab held open by an attempt but drawn
       as `connected` would say the opposite of what is true. */
    expect(openTabs([live('a', 'unreachable')], 'a')[0]?.kind).toBe('unreachable');
  });
});

describe('moving between tabs', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];

  it('steps to the next one', () => {
    expect(tabAfter(tabs, 'a', 1)).toBe('b');
    expect(tabAfter(tabs, 'b', -1)).toBe('a');
  });

  it('wraps at both ends', () => {
    /* Stopping dead makes a keyboard user check whether the key registered. */
    expect(tabAfter(tabs, 'c', 1)).toBe('a');
    expect(tabAfter(tabs, 'a', -1)).toBe('c');
  });

  it('starts somewhere when nothing is active', () => {
    expect(tabAfter(tabs, null, 1)).toBe('a');
  });

  it('has nowhere to go with no tabs', () => {
    expect(tabAfter([], null, 1)).toBeNull();
  });
});

describe('closing a tab', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];

  it('activates the neighbour to the right', () => {
    expect(tabAfterClosing(tabs, 'b')).toBe('c');
  });

  it('falls back to the left at the end of the strip', () => {
    expect(tabAfterClosing(tabs, 'c')).toBe('b');
  });

  it('activates nothing when the last one goes', () => {
    expect(tabAfterClosing([tab('a')], 'a')).toBeNull();
  });
});

describe('the active tab', () => {
  it('stays where it is while its tab exists', () => {
    expect(resolveActive([tab('a'), tab('b')], 'b')).toBe('b');
  });

  it('moves when the host drops the connection under it', () => {
    /* Nobody clicked. Leaving it pointing at a tab that is gone shows an
       empty terminal with no way back. */
    expect(resolveActive([tab('a')], 'b')).toBe('a');
  });

  it('is nothing when nothing is open', () => {
    expect(resolveActive([], 'b')).toBeNull();
  });
});
