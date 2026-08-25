/**
 * Guards the row menu.
 *
 * It exists because the sidebar row only ever connected. Changing a port,
 * renaming, deleting — all of it lived behind the command palette, which is
 * fine as a second way to reach something and useless as the only one. The
 * first person to run a build hit exactly that: a saved session with the wrong
 * port and no visible way to change it.
 */

import { describe, expect, it } from 'vitest';

import { menuPosition, sessionMenu } from '../src/features/sessions/menu';
import type { LiveSession } from '../src/features/sessions';
import { createTranslator } from '../src/lib/i18n';

function live(kind: LiveSession['kind'], handle: number | null = null): LiveSession {
  return {
    session: {
      id: 'a',
      name: 'docker',
      host: '127.0.0.1',
      port: 22,
      user: 'deploy',
      group: null,
      credentialId: null,
      proxyJump: null,
    },
    handle,
    kind,
  };
}

describe('the row menu', () => {
  it('always offers a way to change the session', () => {
    /* The whole reason it exists. A saved host with the wrong port and no
       visible way to edit it is a dead end. */
    for (const entry of [live('saved'), live('connected', 1), live('unreachable')]) {
      expect(sessionMenu(entry).map((item) => item.action)).toContain('edit');
    }
  });

  it('always offers a way to delete it', () => {
    expect(sessionMenu(live('saved')).map((item) => item.action)).toContain('delete');
  });

  it('offers to connect what is closed', () => {
    expect(sessionMenu(live('saved'))[0]?.action).toBe('connect');
    expect(sessionMenu(live('unreachable'))[0]?.action).toBe('connect');
  });

  it('offers to disconnect what is open', () => {
    /* Offering both is offering one that does nothing, and a menu item that
       does nothing is how a menu stops being read. */
    expect(sessionMenu(live('connected', 7))[0]?.action).toBe('disconnect');
    expect(sessionMenu(live('connecting'))[0]?.action).toBe('disconnect');
  });

  it('never offers both at once', () => {
    for (const entry of [live('saved'), live('connected', 1), live('connecting')]) {
      const actions = sessionMenu(entry).map((item) => item.action);

      expect(actions.includes('connect') && actions.includes('disconnect')).toBe(false);
    }
  });

  it('marks only the item that loses something', () => {
    const destructive = sessionMenu(live('connected', 1))
      .filter((item) => item.destructive)
      .map((item) => item.action);

    expect(destructive).toEqual(['delete']);
  });

  it('says every item in every language', () => {
    for (const locale of ['en', 'pt-BR', 'es']) {
      const i18n = createTranslator(locale);

      for (const item of sessionMenu(live('connected', 1))) {
        expect(i18n.t(item.label).length).toBeGreaterThan(2);
      }
      for (const item of sessionMenu(live('saved'))) {
        expect(i18n.t(item.label).length).toBeGreaterThan(2);
      }
    }
  });
});

describe('placing the menu', () => {
  const size = { width: 168, height: 92 };
  const viewport = { width: 1440, height: 900 };

  it('opens where it was asked to', () => {
    expect(menuPosition({ x: 200, y: 300 }, size, viewport)).toEqual({ x: 200, y: 300 });
  });

  it('stays on screen near the bottom', () => {
    /* A menu whose last item is off screen hides the one that deletes. */
    const { y } = menuPosition({ x: 200, y: 880 }, size, viewport);

    expect(y + size.height).toBeLessThanOrEqual(viewport.height);
  });

  it('stays on screen near the right edge', () => {
    const { x } = menuPosition({ x: 1430, y: 300 }, size, viewport);

    expect(x + size.width).toBeLessThanOrEqual(viewport.width);
  });

  it('never goes off the top or the left', () => {
    expect(menuPosition({ x: -50, y: -50 }, size, viewport)).toEqual({ x: 4, y: 4 });
  });
});
