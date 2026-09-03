/**
 * Guards the row menu.
 *
 * Connect or disconnect, one or the other, never both and never anything
 * else: ADR-0029 moved editing and deleting to Home's Hosts section, on the
 * argument that driving a connection and changing the record behind it are
 * different tasks. This is the row's half of that split holding.
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
      kind: 'direct',
      forwards: [],
    },
    handle,
    kind,
  };
}

describe('the row menu', () => {
  it('never offers to edit or delete', () => {
    /* That moved to Home's Hosts section. A row here does one thing. */
    for (const entry of [live('saved'), live('connected', 1), live('unreachable')]) {
      const actions = sessionMenu(entry).map((item) => item.action);
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('delete');
    }
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

  it('marks nothing as destructive', () => {
    /* Disconnecting loses nothing a reconnect does not get back; the one
       action that does, deleting the record, is not offered here any more. */
    for (const entry of [live('saved'), live('connected', 1)]) {
      expect(sessionMenu(entry).some((item) => item.destructive)).toBe(false);
    }
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
