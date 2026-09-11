// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * What the stage does with a vision (ADR-0067), driven through the hook.
 *
 * Filling the screen is a state of the stage and not of the file: every
 * member opens, nothing is written, and leaving gives back what was open
 * before. Membership is decided at the drop: a component dropped in a
 * region joins it pinned where it landed, a member dropped outside leaves
 * at that point, and a vision dragged by its bar moves as one.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FULLSCREEN_BAR, FULLSCREEN_GAP, useMapStage } from '../src/features/map/use-map-stage';
import type { Vision, Workspace } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

type Api = ReturnType<typeof useMapStage>;

const VISION: Vision = { id: 'v1', name: 'prod', components: ['c2'], open: true, position: { x: 0, y: 0 } };
const WORKSPACE: Workspace = {
  components: [
    { id: 'c1', kind: 'ssh', host: 's1', position: { x: 600, y: 600 } },
    { id: 'c2', kind: 'ssh', host: 's2' },
  ],
  links: [],
  visions: [VISION],
  layers: [],
};

function Harness({
  workspace,
  onChange,
  onApi,
}: {
  readonly workspace: Workspace;
  readonly onChange: (next: Workspace) => void;
  readonly onApi: (api: Api) => void;
}): null {
  const api = useMapStage({
    workspace,
    components: workspace.components,
    visions: workspace.visions,
    onChange,
    radialOptions: () => 0,
    onClick: () => {},
    onRadialPick: () => {},
  });
  useEffect(() => {
    onApi(api);
  });
  useEffect(() => {
    const stage = document.createElement('div');
    document.body.appendChild(stage);
    api.setStageElement(stage);
    return () => stage.remove();
    // The stage element is created once, for the life of the harness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function press(clientX: number, clientY: number): React.PointerEvent {
  return { button: 0, clientX, clientY, pointerId: 1, stopPropagation: () => {} } as unknown as React.PointerEvent;
}

function pointer(type: 'pointermove' | 'pointerup', clientX: number, clientY: number): void {
  window.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

describe('a vision on the stage', () => {
  let originalObserver: typeof ResizeObserver | undefined;
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let api: Api | null;
  let changes: Workspace[];

  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = null;
    changes = [];
    act(() => {
      root.render(createElement(Harness, { workspace: WORKSPACE, onChange: (next) => changes.push(next), onApi: (next) => (api = next) }));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    if (originalObserver === undefined) {
      // @ts-expect-error restoring an environment without ResizeObserver
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalObserver;
    }
  });

  it('lays a member out from the vision’s corner and draws the region there', () => {
    /* One icon flowing in a 1x1: margin, half the cell, under the bar. */
    expect(api?.positions.get('c2')).toEqual({ x: 20 + 80, y: 28 + 20 + 60 });
    expect(api?.regions).toEqual([{ id: 'v1', left: 0, top: 0, width: 200, height: 188, maximized: null }]);
    /* A free component keeps its own place. */
    expect(api?.positions.get('c1')).toEqual({ x: 600, y: 600 });
  });

  it('fills the screen with every member open, writes nothing, and gives back what was open', () => {
    act(() => {
      api?.enterFullscreen('v1');
    });
    expect(api?.fullscreen).toBe('v1');
    expect(api?.open.has('c2')).toBe(true);
    expect(api?.regions).toEqual([]);
    const cell = api?.windows.find((window) => window.id === 'c2');
    expect(cell?.cell).toBe(true);
    expect(cell?.top).toBe(FULLSCREEN_BAR + FULLSCREEN_GAP);
    expect(changes).toEqual([]);

    act(() => {
      api?.exitFullscreen();
    });
    expect(api?.fullscreen).toBeNull();
    expect(api?.open.has('c2')).toBe(false);
    expect(changes).toEqual([]);
  });

  it('leaves the screen on Escape, and only while filling it', () => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(api?.fullscreen).toBeNull();
    act(() => {
      api?.enterFullscreen('v1');
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(api?.fullscreen).toBeNull();
  });

  it('maximizes a member inside its region, a child window, and restores it', () => {
    act(() => {
      api?.openWindow('c2');
    });
    act(() => {
      api?.toggleMaximize('c2');
    });
    expect(api?.regions[0]?.maximized).toBe('c2');
    const child = api?.windows.find((window) => window.id === 'c2');
    expect(child?.cell).toBe(true);
    expect(child?.top).toBe(28);
    expect(child?.width).toBeGreaterThan(0);
    act(() => {
      api?.toggleMaximize('c2');
    });
    expect(api?.regions[0]?.maximized).toBeNull();
    expect(api?.windows.find((window) => window.id === 'c2')?.cell).toBe(false);
  });

  it('puts a component dropped in a region into the vision, pinned where it landed', () => {
    act(() => {
      api?.onNodePointerDown('c1', press(600, 600));
    });
    act(() => {
      pointer('pointermove', 100, 100);
    });
    expect(api?.dropTarget).toBe('v1');
    act(() => {
      pointer('pointerup', 100, 100);
    });
    const next = changes.at(-1);
    expect(next?.visions[0]?.components).toEqual(['c2', 'c1']);
    expect(next?.components.find((one) => one.id === 'c1')?.position).toEqual({ x: 100, y: 100 });
  });

  it('takes a member dropped outside out of the vision, where it was dropped', () => {
    const at = api?.positions.get('c2') ?? { x: 0, y: 0 };
    act(() => {
      api?.onNodePointerDown('c2', press(at.x, at.y));
    });
    act(() => {
      pointer('pointermove', 900, 900);
    });
    expect(api?.dropTarget).toBeNull();
    act(() => {
      pointer('pointerup', 900, 900);
    });
    const next = changes.at(-1);
    expect(next?.visions[0]?.components).toEqual([]);
    expect(next?.components.find((one) => one.id === 'c2')?.position).toEqual({ x: 900, y: 900 });
  });

  it('moves the whole vision by its bar', () => {
    act(() => {
      api?.onStripPointerDown('v1', press(0, 0));
    });
    act(() => {
      pointer('pointermove', 300, 300);
    });
    /* The member follows while dragging: positions are read from the corner. */
    expect(api?.positions.get('c2')).toEqual({ x: 300 + 100, y: 300 + 108 });
    act(() => {
      pointer('pointerup', 300, 300);
    });
    expect(changes.at(-1)?.visions[0]?.position).toEqual({ x: 300, y: 300 });
    expect(changes.at(-1)?.components).toEqual(WORKSPACE.components);
  });
});
