// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * What the stage does with a layer (ADR-0068), driven through the hook.
 *
 * A layer shares the ring with components and visions (`fitAll`'s own
 * bounding box, and the drop consequences ADR-0068's "Bad" section names),
 * and its monolith is dragged the same way a closed vision's aperture is:
 * freely, with no drop target and no edge snap. Entering and leaving a
 * layer are `MapStage`'s own concern, not the hook's, since which level is
 * in view decides what `components`/`visions` the hook is even called
 * with; this file holds only what the hook itself does with a `layers`
 * list once it has one.
 */

import { act, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMapStage } from '../src/features/map/use-map-stage';
import type { Layer, Workspace } from '../src/ipc';

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
