// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * The chrome shared by every closed thing on the map (`MapNode`), the
 * primitive `ComponentNode`, `VisionNode`, `MonolithNode` and the hub all
 * draw through: positioned, focusable, opened by Enter or Space, dimmed and
 * lifted above a drag.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { MapNode } from '../src/components/map/MapNode';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element: ReturnType<typeof createElement>) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(element);
  });

  return {
    rootEl,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

describe('MapNode', () => {
  it('marks itself as a focusable button, at its centre, labelled and identified', async () => {
    const { rootEl, unmount } = await mount(
      createElement(
        MapNode,
        { id: 'c1', label: 'prod-db', at: { x: 40, y: 60 }, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} },
        'inner',
      ),
    );
    const node = rootEl.querySelector('[role="button"]');
    expect(node?.getAttribute('tabindex')).toBe('0');
    expect(node?.getAttribute('aria-label')).toBe('prod-db');
    expect(node?.getAttribute('data-component')).toBe('c1');
    expect((node as HTMLElement).style.left).toBe('40px');
    expect((node as HTMLElement).style.top).toBe('60px');
    expect(node?.textContent).toBe('inner');
    await unmount();
  });

  it('carries the extra marker a drop target reads, and none when there is none', async () => {
    const withMarker = await mount(
      createElement(MapNode, { id: 'v1', label: 'prod', at: { x: 0, y: 0 }, extraAttr: 'data-vision', onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} }),
    );
    expect(withMarker.rootEl.querySelector('[data-vision]')).not.toBeNull();
    await withMarker.unmount();

    const withoutMarker = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} }),
    );
    expect(withoutMarker.rootEl.querySelector('[data-vision]')).toBeNull();
    await withoutMarker.unmount();
  });

  it('dims and lifts by its own two flags, plain by default', async () => {
    const plain = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} }),
    );
    const plainClass = plain.rootEl.querySelector('[role="button"]')?.className ?? '';
    expect(plainClass).not.toContain('opacity-20');
    expect(plainClass).not.toContain('z-50');
    await plain.unmount();

    const dimmed = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, dimmed: true, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} }),
    );
    expect(dimmed.rootEl.querySelector('[role="button"]')?.className).toContain('opacity-20');
    await dimmed.unmount();

    const dragging = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, dragging: true, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen: () => {} }),
    );
    expect(dragging.rootEl.querySelector('[role="button"]')?.className).toContain('z-50 opacity-90');
    await dragging.unmount();
  });

  it('opens on Enter and Space, not on other keys', async () => {
    const onKeyOpen = vi.fn();
    const { rootEl, unmount } = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, onPointerDown: () => {}, onContextMenu: () => {}, onKeyOpen }),
    );
    const node = rootEl.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(onKeyOpen).not.toHaveBeenCalled();
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    act(() => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(onKeyOpen).toHaveBeenCalledTimes(2);
    await unmount();
  });

  it('reports a pointer press and a context menu to its caller', async () => {
    const onPointerDown = vi.fn();
    const onContextMenu = vi.fn();
    const { rootEl, unmount } = await mount(
      createElement(MapNode, { id: 'c1', label: 'db', at: { x: 0, y: 0 }, onPointerDown, onContextMenu, onKeyOpen: () => {} }),
    );
    const node = rootEl.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    await unmount();
  });
});
