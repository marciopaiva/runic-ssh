// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * What the stage does with a layer (ADR-0068), driven through the hook.
 *
 * A layer shares the ring with components and visions (`fitAll`'s own
 * bounding box), and its own monolith is dragged the same way a closed
 * vision's aperture is: freely, with no drop target and no edge snap.
 * Dropping something else on it is a different story, once ADR-0068's
 * "Bad" section stopped naming it as missing (#387): a free component or
 * a whole vision moves into the layer it lands on, the aperture-reach
 * standing in for a region a layer never has. Entering and leaving a
 * layer are `MapStage`'s own concern, not the hook's, since which level is
 * in view decides what `components`/`visions` the hook is even called
 * with; this file holds only what the hook itself does with a `layers`
 * list once it has one.
 */

import { act, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMapStage } from '../src/features/map/use-map-stage';
import type { Layer, Vision, Workspace } from '../src/ipc';

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

const STAGE = { width: 1000, height: 600 };
const LAYER: Layer = { id: 'l1', name: 'Lab', position: { x: 400, y: 200 } };
const WORKSPACE: Workspace = {
  components: [{ id: 'c1', kind: 'ssh', host: 's1', position: { x: -300, y: -100 } }],
  links: [],
  visions: [],
  layers: [LAYER],
};

function Harness({ onChange, onApi }: { readonly onChange: (next: Workspace) => void; readonly onApi: (api: Api) => void }): null {
  const api = useMapStage({
    workspace: WORKSPACE,
    components: WORKSPACE.components,
    visions: WORKSPACE.visions,
    layers: WORKSPACE.layers,
    onChange,
    radialOptions: () => 0,
    onClick: () => {},
    onRadialPick: () => {},
  });
  /* Handed over during render, the way a ref callback is in `MapStage`, so
     the hook's measuring effect finds it on the first pass. */
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

function press(clientX: number, clientY: number): React.PointerEvent {
  return { button: 0, clientX, clientY, pointerId: 1, stopPropagation: () => {} } as unknown as React.PointerEvent;
}

function pointer(type: 'pointermove' | 'pointerup', clientX: number, clientY: number): void {
  window.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

describe('a layer on the stage', () => {
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
      root.render(createElement(Harness, { onChange: (next) => changes.push(next), onApi: (next) => (api = next) }));
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

  it('sits on the ring at its own explicit position', () => {
    expect(api?.positions.get('l1')).toEqual({ x: 400, y: 200 });
  });

  it('is dragged freely, no drop target and no edge snap, and the drop writes its new place', () => {
    act(() => {
      api?.onNodePointerDown('l1', press(400, 200));
    });
    act(() => {
      pointer('pointermove', 700, 500);
    });
    expect(api?.dropTarget).toBeNull();
    expect(api?.snapPreview).toBeNull();
    expect(api?.positions.get('l1')).toEqual({ x: 700, y: 500 });

    act(() => {
      pointer('pointerup', 700, 500);
    });
    const written = changes.at(-1);
    expect(written?.layers[0]).toEqual({ ...LAYER, position: { x: 700, y: 500 } });
    /* Nothing else moved: the component keeps the place it already had. */
    expect(written?.components[0]?.position).toEqual({ x: -300, y: -100 });
  });

  it('is included in fitAll’s own bounding box', () => {
    act(() => {
      api?.fitAll();
    });
    const view = api?.view;
    expect(view).toBeDefined();
    if (view === undefined) return;
    /* Both the layer at (400, 200) and the component at (-300, -100) have
       to fall inside the fitted view's own stage rectangle. */
    const stageLeft = -view.x / view.scale;
    const stageTop = -view.y / view.scale;
    const stageRight = (STAGE.width - view.x) / view.scale;
    const stageBottom = (STAGE.height - view.y) / view.scale;
    expect(stageLeft).toBeLessThanOrEqual(-300);
    expect(stageTop).toBeLessThanOrEqual(-100);
    expect(stageRight).toBeGreaterThanOrEqual(400);
    expect(stageBottom).toBeGreaterThanOrEqual(200);
  });
});

describe('dragging onto a layer moves it there, the same as its menu entry (#387)', () => {
  const LAYER2: Layer = { id: 'l2', name: 'Prod', position: { x: 800, y: 100 } };
  const VISION2: Vision = { id: 'v2', name: 'db', components: ['m1'], open: true, position: { x: -300, y: -300 } };
  const WORKSPACE2: Workspace = {
    components: [
      { id: 'free1', kind: 'ssh', host: 's1', position: { x: -600, y: -600 } },
      { id: 'm1', kind: 'ssh', host: 's2' },
    ],
    links: [],
    visions: [VISION2],
    layers: [LAYER2],
  };

  function Harness2({ onChange, onApi }: { readonly onChange: (next: Workspace) => void; readonly onApi: (api: Api) => void }): null {
    const api = useMapStage({
      workspace: WORKSPACE2,
      components: WORKSPACE2.components,
      visions: WORKSPACE2.visions,
      layers: WORKSPACE2.layers,
      onChange,
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
      root.render(createElement(Harness2, { onChange: (next) => changes.push(next), onApi: (next) => (api = next) }));
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

  it('moves a free component into the layer it is dropped on', () => {
    act(() => {
      api?.onNodePointerDown('free1', press(-600, -600));
    });
    act(() => {
      pointer('pointermove', 800, 100);
    });
    expect(api?.dropTarget).toBe('l2');
    act(() => {
      pointer('pointerup', 800, 100);
    });
    const written = changes.at(-1);
    const moved = written?.components.find((component) => component.id === 'free1');
    expect(moved?.layer).toBe('l2');
    expect(moved?.position).toBeUndefined();
  });

  it('moves a whole vision, members included, into the layer it is dropped on', () => {
    act(() => {
      api?.onNodePointerDown('v2', press(-300, -300));
    });
    act(() => {
      pointer('pointermove', 800, 100);
    });
    expect(api?.dropTarget).toBe('l2');
    act(() => {
      pointer('pointerup', 800, 100);
    });
    const written = changes.at(-1);
    const moved = written?.visions.find((vision) => vision.id === 'v2');
    expect(moved?.layer).toBe('l2');
    expect(moved?.position).toBeUndefined();
    /* The member moves with its vision, not by anything of its own. */
    expect(moved?.components).toEqual(['m1']);
  });

  it('leaves a member drag alone: it only ever leaves its vision, the layer is not a target', () => {
    const at = api?.positions.get('m1');
    expect(at).toBeDefined();
    if (at === undefined) return;
    act(() => {
      api?.onNodePointerDown('m1', press(at.x, at.y));
    });
    act(() => {
      pointer('pointermove', 800, 100);
    });
    /* Not a vision under the pointer, and a member never targets a layer. */
    expect(api?.dropTarget).toBeNull();
    act(() => {
      pointer('pointerup', 800, 100);
    });
    const written = changes.at(-1);
    expect(written?.visions[0]?.components).toEqual([]);
    const freed = written?.components.find((component) => component.id === 'm1');
    expect(freed?.layer).toBeUndefined();
    expect(freed?.position).toEqual({ x: 800, y: 100 });
  });
});
