// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * The pointer is captured on the element that was pressed, not on the stage.
 *
 * #363: a strip press captured on the stage, so the `pointerup` was
 * retargeted there and the browser dispatched the compatibility `click`,
 * and the `dblclick` after it, to the common ancestor of press and release,
 * which was the stage. The strip's own double-click never fired and the
 * stage's ran fit-to-view instead of maximizing. Every browser does this;
 * it is the pointer capture specification. The window listeners the hook
 * keeps still do the tracking, so capturing on the pressed element costs
 * nothing and puts `click` back where the press was.
 *
 * jsdom has no pointer capture, which is why each element here is given
 * one by hand: the assertion is about which element the hook asks.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMapStage } from '../src/features/map/use-map-stage';
import { EMPTY_WORKSPACE } from '../src/ipc';

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

function Harness({ stage, onApi }: { readonly stage: HTMLDivElement; readonly onApi: (api: Api) => void }): null {
  const api = useMapStage({
    workspace: EMPTY_WORKSPACE,
    components: [{ id: 'c1', kind: 'ssh', host: 's1' }],
    visions: [],
    onChange: () => {},
    radialOptions: () => 3,
    onClick: () => {},
    onRadialPick: () => {},
  });
  useEffect(() => {
    onApi(api);
  });
  useEffect(() => {
    api.setStageElement(stage);
    // The stage element is the harness's, for its whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function captureSpy(element: HTMLElement): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  (element as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture = spy;
  return spy;
}

function pressOn(target: HTMLElement, pointerId: number): React.PointerEvent {
  return {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId,
    currentTarget: target,
    stopPropagation: () => {},
  } as unknown as React.PointerEvent;
}

describe('the map stage captures the pointer on the element pressed', () => {
  const originalObserver = globalThis.ResizeObserver;
  let root: ReturnType<typeof createRoot> | null = null;
  let host: HTMLElement | null = null;

  function mount(): { api: Api; stage: HTMLDivElement; stageCapture: ReturnType<typeof vi.fn> } {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    const stage = document.createElement('div');
    host.appendChild(stage);
    const stageCapture = captureSpy(stage);
    root = createRoot(host);
    let api: Api | null = null;
    act(() => {
      root?.render(createElement(Harness, { stage, onApi: (next) => (api = next) }));
    });
    if (api === null) throw new Error('the harness never reported its api');
    return { api, stage, stageCapture };
  }

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    if (originalObserver === undefined) {
      // @ts-expect-error restoring an environment without ResizeObserver
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalObserver;
    }
  });

  it('a strip press captures on the strip, so its double-click reaches it (#363)', () => {
    const { api, stage, stageCapture } = mount();
    const strip = document.createElement('div');
    stage.appendChild(strip);
    const stripCapture = captureSpy(strip);

    act(() => {
      api.onStripPointerDown('c1', pressOn(strip, 7));
    });

    expect(stripCapture).toHaveBeenCalledWith(7);
    expect(stageCapture).not.toHaveBeenCalled();
  });

  it('a resize handle press captures on the handle', () => {
    const { api, stage, stageCapture } = mount();
    const handle = document.createElement('div');
    stage.appendChild(handle);
    const handleCapture = captureSpy(handle);

    act(() => {
      api.onResizePointerDown('c1', 'e', pressOn(handle, 8));
    });

    expect(handleCapture).toHaveBeenCalledWith(8);
    expect(stageCapture).not.toHaveBeenCalled();
  });

  it('a node press captures on the node', () => {
    const { api, stage, stageCapture } = mount();
    const node = document.createElement('div');
    stage.appendChild(node);
    const nodeCapture = captureSpy(node);

    act(() => {
      api.onNodePointerDown('c1', pressOn(node, 9));
    });

    expect(nodeCapture).toHaveBeenCalledWith(9);
    expect(stageCapture).not.toHaveBeenCalled();
  });

  it('a press on the floor still captures on the stage, which is what pans', () => {
    const { api, stage, stageCapture } = mount();

    act(() => {
      api.onStagePointerDown(pressOn(stage, 10));
    });

    expect(stageCapture).toHaveBeenCalledWith(10);
  });
});
