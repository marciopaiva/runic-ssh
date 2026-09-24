// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * Keyboard navigation on `MapMenu`: the list at the pointer that stands in
 * for the radial when a screen reader or a keyboard drives it. Native Tab
 * order alone was the only way to move between items; this adds Arrow,
 * Home and End, skipping a disabled entry rather than landing on it, and
 * makes the menu open focused on the first entry that can actually be
 * taken, not merely the first one listed.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { MapMenu } from '../src/components/map/MapMenu';
import type { MapMenuItem } from '../src/components/map/MapMenu';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: readonly MapMenuItem[] = [
  { id: 'copy', label: 'Copy', disabled: true },
  { id: 'paste', label: 'Paste' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'mute', label: 'Mute', disabled: true },
];

async function mount(items: readonly MapMenuItem[], onPick = vi.fn(), onClose = vi.fn()) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);
  await act(async () => {
    root.render(createElement(MapMenu, { at: { x: 0, y: 0 }, title: 'Menu', items, onPick, onClose }));
  });
  return {
    rootEl,
    buttons: (): HTMLButtonElement[] => Array.from(rootEl.querySelectorAll('button[role="menuitem"]')),
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

function key(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('MapMenu keyboard navigation', () => {
  it('opens focused on the first item that can actually be taken', async () => {
    const { buttons, unmount } = await mount(ITEMS);
    expect(document.activeElement).toBe(buttons()[1]);
    await unmount();
  });

  it('moves down and up between the enabled items, skipping the disabled ones', async () => {
    const { rootEl, buttons, unmount } = await mount(ITEMS);
    const [, paste, broadcast] = buttons();
    key(rootEl.querySelector('[role="menu"]') as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(broadcast);
    key(rootEl.querySelector('[role="menu"]') as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(paste);
    await unmount();
  });

  it('wraps at both ends', async () => {
    const { rootEl, buttons, unmount } = await mount(ITEMS);
    const [, paste, broadcast] = buttons();
    const menu = rootEl.querySelector('[role="menu"]') as HTMLElement;
    key(menu, 'ArrowUp');
    expect(document.activeElement).toBe(broadcast);
    key(menu, 'ArrowDown');
    expect(document.activeElement).toBe(paste);
    await unmount();
  });

  it('Home and End jump to the first and last enabled item', async () => {
    const { rootEl, buttons, unmount } = await mount(ITEMS);
    const [, paste, broadcast] = buttons();
    const menu = rootEl.querySelector('[role="menu"]') as HTMLElement;
    key(menu, 'End');
    expect(document.activeElement).toBe(broadcast);
    key(menu, 'Home');
    expect(document.activeElement).toBe(paste);
    await unmount();
  });

  it('does nothing when every item is disabled', async () => {
    const { rootEl, unmount } = await mount([{ id: 'a', label: 'A', disabled: true }]);
    const menu = rootEl.querySelector('[role="menu"]') as HTMLElement;
    expect(() => key(menu, 'ArrowDown')).not.toThrow();
    await unmount();
  });
});
