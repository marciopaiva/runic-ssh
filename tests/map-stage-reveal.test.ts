// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * Opening a window brings it to the centre of the stage.
 *
 * The window still expands from its icon; what moves is the view, and only
 * on the first open, since a click on a window already open is focus and
 * not a request to move the map under the others. From below the refit
 * floor the view also comes to 1:1, because a window opened is a window
 * about to be typed into. Under reduced motion the view cuts; otherwise it
 * glides on the same frame handle as the fling, so unmounting mid-glide
 * cancels it.
 */

import { act, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REFIT_MIN, fitTo, layoutVision } from '../src/features/map';
import { REVEAL_MS, useMapStage } from '../src/features/map/use-map-stage';
import type { Rect } from '../src/features/map';
import type { Vision, Workspace } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

type Api = ReturnType<typeof useMapStage>;

const STAGE = { width: 1000, height: 600 };
const WORKSPACE: Workspace = {
  components: [{ id: 'c1', kind: 'ssh', host: 's1', position: { x: 800, y: 500 } }],
  links: [],
  visions: [],
  layers: [],
};

function Harness({ onApi }: { readonly onApi: (api: Api) => void }): null {
  const api = useMapStage({
    workspace: WORKSPACE,
    components: WORKSPACE.components,
    visions: [],
    layers: [],
    onChange: () => {},
    radialOptions: () => 0,
    onClick: () => {},
    onRadialPick: () => {},
  });
  /* Handed over during render, the way a ref callback is in `MapStage`,
     so the hook's measuring effect finds it on the first pass. */
  const [stage] = useState(() => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { value: STAGE.width });
    Object.defineProperty(element, 'clientHeight', { value: STAGE.height });
    return element;
  });
  api.setStageElement(stage);
  useEffect(() => {
    onApi(api);
  });
  useEffect(() => {
    document.body.appendChild(stage);
    return () => stage.remove();
  }, [stage]);
  return null;
}

describe('opening a window reveals it', () => {
  let originalObserver: typeof ResizeObserver | undefined;
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let api: Api | null;
  let frames: FrameRequestCallback[];
  let cancelled: number[];
  let reduced: boolean;

  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    frames = [];
    cancelled = [];
    reduced = true;
    window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce') })) as unknown as typeof window.matchMedia;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((handle: number) => {
      cancelled.push(handle);
    }) as typeof window.cancelAnimationFrame;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = null;
    act(() => {
      root.render(createElement(Harness, { onApi: (next) => (api = next) }));
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

  it('centres the view on the window, cut under reduced motion', () => {
    act(() => {
      api?.openWindow('c1');
    });
    /* The icon at (800, 500) lands at the stage's centre (500, 300) at the
       same zoom, so the window drawn around it is centred too. */
    expect(api?.view).toEqual({ x: 500 - 800, y: 300 - 500, scale: 1 });
    const window = api?.windows.find((one) => one.id === 'c1');
    expect(window).toBeDefined();
    if (window === undefined) return;
    expect(window.left + window.width / 2).toBe(500);
    expect(window.top + window.height / 2).toBe(300);
  });

  it('comes to 1:1 from below the refit floor, and stays where it was above it', () => {
    act(() => {
      api?.onWheel({
        deltaY: 1,
        clientX: 0,
        clientY: 0,
        target: null,
        preventDefault: () => {},
      } as unknown as React.WheelEvent);
    });
    const zoomedOut = api?.view.scale ?? 1;
    expect(zoomedOut).toBeLessThan(1);
    expect(zoomedOut).toBeGreaterThanOrEqual(REFIT_MIN);
    act(() => {
      api?.openWindow('c1');
    });
    expect(api?.view.scale).toBe(zoomedOut);

    act(() => {
      api?.collapse('c1');
    });
    /* Below the floor: three more notches. */
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        api?.onWheel({ deltaY: 1, clientX: 0, clientY: 0, target: null, preventDefault: () => {} } as unknown as React.WheelEvent);
      });
    }
    expect(api?.view.scale ?? 1).toBeLessThan(REFIT_MIN);
    act(() => {
      api?.openWindow('c1');
    });
    expect(api?.view).toEqual({ x: 500 - 800, y: 300 - 500, scale: 1 });
  });

  it('moves the view on the first open only, and not when asked not to', () => {
    act(() => {
      api?.openWindow('c1');
    });
    const revealed = api?.view;
    act(() => {
      api?.onWheel({ deltaY: 1, clientX: 0, clientY: 0, target: null, preventDefault: () => {} } as unknown as React.WheelEvent);
    });
    const moved = api?.view;
    expect(moved).not.toEqual(revealed);
    act(() => {
      api?.openWindow('c1');
    });
    expect(api?.view).toEqual(moved);

    act(() => {
      api?.collapse('c1');
    });
    act(() => {
      api?.openWindow('c1', false);
    });
    expect(api?.view).toEqual(moved);
  });

  it('glides over the normal duration with motion allowed, and unmounting cancels the glide', () => {
    reduced = false;
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    act(() => {
      api?.openWindow('c1');
    });
    expect(frames).toHaveLength(1);
    expect(api?.view).toEqual({ x: 0, y: 0, scale: 1 });
    /* Opening changed the open set, which re-registers the pointer
       listeners; that must not cancel the glide it just started. */
    expect(cancelled).toEqual([]);

    now.mockReturnValue(1000 + REVEAL_MS / 2);
    act(() => {
      frames[0]?.(0);
    });
    const midway = api?.view ?? { x: 0, y: 0, scale: 1 };
    expect(midway.x).toBeLessThan(0);
    expect(midway.x).toBeGreaterThan(-300);
    expect(frames).toHaveLength(2);

    now.mockReturnValue(1000 + REVEAL_MS);
    act(() => {
      frames[1]?.(0);
    });
    expect(api?.view).toEqual({ x: -300, y: -200, scale: 1 });
    expect(frames).toHaveLength(2);

    /* A glide cut short by unmounting is cancelled, not left running. */
    act(() => {
      api?.collapse('c1');
    });
    now.mockReturnValue(2000);
    act(() => {
      api?.openWindow('c1');
    });
    const inFlight = frames.length;
    act(() => {
      root.unmount();
    });
    expect(cancelled).toContain(inFlight);
    now.mockRestore();
    /* Rendered again so `afterEach`'s unmount has something to unmount. */
    root = createRoot(host);
    act(() => {
      root.render(createElement(Harness, { onApi: (next) => (api = next) }));
    });
  });
});

describe('opening a member of a vision reveals the whole region', () => {
  const VISION: Vision = { id: 'v1', name: 'v', components: ['c1', 'c2'], open: true, position: { x: 100, y: 100 } };
  const VISION_WORKSPACE: Workspace = {
    components: [
      { id: 'c1', kind: 'ssh', host: 's1' },
      { id: 'c2', kind: 'ssh', host: 's2' },
    ],
    links: [],
    visions: [VISION],
    layers: [],
  };

  function VisionHarness({ onApi }: { readonly onApi: (api: Api) => void }): null {
    const api = useMapStage({
      workspace: VISION_WORKSPACE,
      components: VISION_WORKSPACE.components,
      visions: VISION_WORKSPACE.visions,
      layers: VISION_WORKSPACE.layers,
      onChange: () => {},
      radialOptions: () => 0,
      onClick: () => {},
      onRadialPick: () => {},
    });
    const [stage] = useState(() => {
      const element = document.createElement('div');
      Object.defineProperty(element, 'clientWidth', { value: STAGE.width });
      Object.defineProperty(element, 'clientHeight', { value: STAGE.height });
      return element;
    });
    api.setStageElement(stage);
    useEffect(() => {
      onApi(api);
    });
    useEffect(() => {
      document.body.appendChild(stage);
      return () => stage.remove();
    }, [stage]);
    return null;
  }

  let originalObserver: typeof ResizeObserver | undefined;
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let api: Api | null;

  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as unknown as typeof window.matchMedia;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = null;
    act(() => {
      root.render(createElement(VisionHarness, { onApi: (next) => (api = next) }));
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

  const regionRect = (members: readonly { readonly id: string; readonly open: boolean }[]): Rect => {
    const layout = layoutVision(
      members.map((member) => ({
        id: member.id,
        size: member.open ? { w: 560, h: 360 } : { w: 160, h: 120 },
        pinned: null,
      })),
    );
    return { left: 100, top: 100, right: 100 + layout.size.w, bottom: 100 + layout.size.h };
  };

  it('fits the region, not just the member, so a sibling and the vision bar stay in view', () => {
    act(() => {
      api?.openWindow('c1');
    });
    const firstRect = regionRect([
      { id: 'c1', open: true },
      { id: 'c2', open: false },
    ]);
    expect(api?.view).toEqual(fitTo(firstRect, STAGE.width, STAGE.height));

    act(() => {
      api?.openWindow('c2');
    });
    const secondRect = regionRect([
      { id: 'c1', open: true },
      { id: 'c2', open: true },
    ]);
    expect(api?.view).toEqual(fitTo(secondRect, STAGE.width, STAGE.height));
    /* The region grew to the right to fit the second window; a fix that
       still centred on c2 alone would have left the vision's own bar,
       anchored at the region's left edge, off stage. */
    expect(api?.view.x).toBeLessThan(0);
  });
});
