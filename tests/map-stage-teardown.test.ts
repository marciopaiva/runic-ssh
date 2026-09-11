// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * Everything `useMapStage` registers, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. The
 * hook subscribes to the window's pointer events for the life of the
 * stage, arms a hold timer on every press, observes the stage's size, and
 * may be mid-fling when the map is switched away from. Each of those is a
 * thing that keeps running after the map is gone unless it is stopped, and
 * a pointer listener left behind is a drag that moves a component nobody
 * can see.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMapStage } from '../src/features/map/use-map-stage';
import { EMPTY_WORKSPACE } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.push(element);
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

function Harness({ onApi }: { readonly onApi: (api: ReturnType<typeof useMapStage>) => void }): null {
  const api = useMapStage({
    workspace: EMPTY_WORKSPACE,
    components: [{ id: 'c1', kind: 'ssh', host: 's1' }],
    visions: [{ id: 'v1', name: 'v', components: ['c1'], open: false }],
    layers: [],
    onChange: () => {},
    radialOptions: () => 3,
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

describe('the map stage tears down what it registers', () => {
  const added = new Map<string, number>();
  const removed = new Map<string, number>();
  let originalAdd: typeof window.addEventListener;
  let originalRemove: typeof window.removeEventListener;
  let originalObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    added.clear();
    removed.clear();
    FakeResizeObserver.instances = [];
    originalAdd = window.addEventListener;
    originalRemove = window.removeEventListener;
    originalObserver = globalThis.ResizeObserver;
    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.set(type, (added.get(type) ?? 0) + 1);
      return (originalAdd as (...args: unknown[]) => void).call(window, type, ...rest);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.set(type, (removed.get(type) ?? 0) + 1);
      return (originalRemove as (...args: unknown[]) => void).call(window, type, ...rest);
    }) as typeof window.removeEventListener;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
    if (originalObserver === undefined) {
      // @ts-expect-error restoring an environment without ResizeObserver
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalObserver;
    }
    vi.useRealTimers();
  });

  it('removes every pointer listener, disconnects the observer and disarms the hold', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let api: ReturnType<typeof useMapStage> | null = null;

    act(() => {
      root.render(createElement(Harness, { onApi: (next) => (api = next) }));
    });
    expect(api).not.toBeNull();

    /* A press arms the hold timer; unmounting before it fires must clear it,
       or the radial opens over a stage that no longer exists. */
    act(() => {
      api?.onNodePointerDown('c1', {
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerId: 1,
        stopPropagation: () => {},
      } as unknown as React.PointerEvent);
    });
    const pending = vi.getTimerCount();
    expect(pending).toBeGreaterThan(0);

    /* A line being drawn listens for Escape; unmounting mid-line must drop
       that listener with the line (ADR-0065). */
    act(() => {
      api?.startLink('c1');
    });
    expect(added.get('keydown') ?? 0).toBeGreaterThan(0);

    /* A vision filling the screen listens for Escape too; unmounting in
       that state must drop the listener with the mode (ADR-0067). */
    act(() => {
      api?.enterFullscreen('v1');
    });
    expect(added.get('keydown') ?? 0).toBeGreaterThan(1);

    act(() => {
      root.unmount();
    });

    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'keydown']) {
      expect(removed.get(type) ?? 0, `${type} listeners removed`).toBe(added.get(type) ?? 0);
      expect(added.get(type) ?? 0).toBeGreaterThan(0);
    }
    expect(FakeResizeObserver.instances.every((instance) => instance.disconnected)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    host.remove();
  });
});
