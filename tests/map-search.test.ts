// @vitest-environment jsdom

/**
 * The map's own search, widened across every layer (#386), driven through
 * the hook in isolation the same way `map-stage-layers.test.ts` drives
 * `useMapStage`: `MapStage` itself has no mounting precedent in this suite,
 * so the cross-layer jump is proven here, against a `componentById` the test
 * controls directly, rather than against the whole component tree.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MapSearch } from '../src/features/map/use-map-search';
import { useMapSearch } from '../src/features/map/use-map-search';
import type { Component, Session, Workspace } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const HOST_A: Session = {
  id: 'h1',
  name: 'alpha',
  host: '10.0.0.1',
  port: 22,
  user: 'root',
  group: null,
  credentialId: null,
  proxyJump: null,
  kind: 'target',
  forwards: [],
};
const HOST_B: Session = {
  id: 'h2',
  name: 'bravo',
  host: '10.0.0.2',
  port: 22,
  user: 'root',
  group: null,
  credentialId: null,
  proxyJump: null,
  kind: 'target',
  forwards: [],
};

const COMPONENT_A: Component = { id: 'ca', kind: 'ssh', host: 'h1' };
const COMPONENT_B: Component = { id: 'cb', kind: 'ssh', host: 'h2', layer: 'l1' };

const WORKSPACE: Workspace = {
  components: [COMPONENT_A, COMPONENT_B],
  links: [],
  visions: [],
  layers: [{ id: 'l1', name: 'Lab', position: { x: 0, y: 0 } }],
};

function hostOf(component: Component): Session | null | undefined {
  if (component.host === 'h1') return HOST_A;
  if (component.host === 'h2') return HOST_B;
  return undefined;
}

interface Calls {
  readonly act: Array<{ target: string; action: 'open' | 'collapse' }>;
  readonly setCurrentLayer: Array<string | null>;
  exitFullscreenCalls: number;
}

function Harness(props: {
  readonly currentLayer: string | null;
  readonly componentById: ReadonlyMap<string, Component>;
  readonly calls: Calls;
  readonly onApi: (api: MapSearch) => void;
}): null {
  const { currentLayer, componentById, calls, onApi } = props;
  const api = useMapSearch({
    workspace: WORKSPACE,
    currentLayer,
    setCurrentLayer: (layer) => calls.setCurrentLayer.push(layer),
    exitFullscreen: () => {
      calls.exitFullscreenCalls += 1;
    },
    componentById,
    isOpen: () => false,
    act: (target, action) => calls.act.push({ target, action }),
    hostOf,
    localName: 'this machine',
  });
  useEffect(() => {
    onApi(api);
  });
  return null;
}

describe("the map's own search, widened across layers (#386)", () => {
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  let api: MapSearch | null;
  let calls: Calls;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    api = null;
    calls = { act: [], setCurrentLayer: [], exitFullscreenCalls: 0 };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  function render(currentLayer: string | null, componentById: ReadonlyMap<string, Component>): void {
    act(() => {
      root.render(createElement(Harness, { currentLayer, componentById, calls, onApi: (next) => (api = next) }));
    });
  }

  it('opens a match on the layer in view immediately, no layer change', () => {
    render(null, new Map([['ca', COMPONENT_A]]));
    act(() => {
      api?.onQueryChange('alpha');
    });
    act(() => {
      api?.onQuerySubmit();
    });
    expect(calls.act).toEqual([{ target: 'ca', action: 'open' }]);
    expect(calls.setCurrentLayer).toEqual([]);
    expect(calls.exitFullscreenCalls).toBe(0);
  });

  it('jumps to another layer and opens the match only once componentById follows', () => {
    render(null, new Map([['ca', COMPONENT_A]]));
    act(() => {
      api?.onQueryChange('bravo');
    });
    act(() => {
      api?.onQuerySubmit();
    });
    expect(calls.exitFullscreenCalls).toBe(1);
    expect(calls.setCurrentLayer).toEqual(['l1']);
    /* Not yet: `componentById` still belongs to the old layer. */
    expect(calls.act).toEqual([]);

    /* The caller follows `setCurrentLayer` and recomputes the map for 'l1'. */
    render('l1', new Map([['cb', COMPONENT_B]]));
    expect(calls.act).toEqual([{ target: 'cb', action: 'open' }]);
  });

  it('does nothing when there is no match', () => {
    render(null, new Map([['ca', COMPONENT_A]]));
    act(() => {
      api?.onQueryChange('nonexistent');
    });
    act(() => {
      api?.onQuerySubmit();
    });
    expect(calls.act).toEqual([]);
    expect(calls.setCurrentLayer).toEqual([]);
    expect(calls.exitFullscreenCalls).toBe(0);
  });

  it('drops a pending target silently if it never turns up in componentById', () => {
    render(null, new Map([['ca', COMPONENT_A]]));
    act(() => {
      api?.onQueryChange('bravo');
    });
    act(() => {
      api?.onQuerySubmit();
    });
    /* The target was removed from the workspace before the layer it was on
       ever came into view; nothing shares its id, so nothing opens. */
    render('l1', new Map());
    expect(calls.act).toEqual([]);
  });

  it('matches every component for an empty query, and only the query’s own match otherwise', () => {
    render(null, new Map([['ca', COMPONENT_A]]));
    expect(api?.matches(COMPONENT_A)).toBe(true);
    expect(api?.matches(COMPONENT_B)).toBe(true);

    act(() => {
      api?.onQueryChange('alpha');
    });
    expect(api?.matches(COMPONENT_A)).toBe(true);
    expect(api?.matches(COMPONENT_B)).toBe(false);
  });
});
