// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * The label hidden while a node is being dragged (#387, Finding 5): at the
 * same point as a drop target's own label once the two centres converge, the
 * pair overlapped and both went illegible until drop. `dragging` already
 * reached each node for its `z-50 opacity-90` styling; this pins that it now
 * also hides the label, and that a node which is merely a drop target
 * (`dragging={false}`) keeps its own.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';
import type { Component, Layer, Session, Vision } from '../src/ipc';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { ComponentNode } = await import('../src/components/map/ComponentNode');
const { VisionNode } = await import('../src/components/map/VisionNode');
const { MonolithNode } = await import('../src/components/map/MonolithNode');

const AT = { x: 100, y: 100 };

const COMPONENT: Component = { id: 'c1', kind: 'ssh', host: 's1' };
const SESSION: Session = {
  id: 's1',
  name: 'prod-db',
  host: 'db.internal',
  port: 22,
  user: 'root',
  group: null,
  credentialId: null,
  proxyJump: null,
  kind: 'direct',
  forwards: [],
};
const VISION: Vision = { id: 'v1', name: 'prod', components: ['c1'], open: false, position: { x: 0, y: 0 } };
const LAYER: Layer = { id: 'l1', name: 'staging' };

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

const noop = (): void => {};

describe('a node being dragged (#387, Finding 5)', () => {
  it('ComponentNode hides its own labels while dragging, shows them otherwise', async () => {
    const shown = await mount(
      createElement(ComponentNode, {
        component: COMPONENT,
        host: SESSION,
        at: AT,
        connected: true,
        dimmed: false,
        dragging: false,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(shown.rootEl.textContent).toContain('prod-db');
    await shown.unmount();

    const hidden = await mount(
      createElement(ComponentNode, {
        component: COMPONENT,
        host: SESSION,
        at: AT,
        connected: true,
        dimmed: false,
        dragging: true,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(hidden.rootEl.textContent).not.toContain('prod-db');
    await hidden.unmount();
  });

  it('VisionNode hides its own label while dragging, shows it otherwise', async () => {
    const shown = await mount(
      createElement(VisionNode, {
        vision: VISION,
        at: AT,
        kinds: ['ssh'],
        dimmed: false,
        dragging: false,
        receiving: false,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(shown.rootEl.textContent).toContain('prod');
    await shown.unmount();

    const hidden = await mount(
      createElement(VisionNode, {
        vision: VISION,
        at: AT,
        kinds: ['ssh'],
        dimmed: false,
        dragging: true,
        receiving: false,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(hidden.rootEl.textContent).not.toContain('prod');
    await hidden.unmount();
  });

  it('MonolithNode hides its own label while dragging, shows it otherwise', async () => {
    const shown = await mount(
      createElement(MonolithNode, {
        layer: LAYER,
        at: AT,
        count: 2,
        dimmed: false,
        dragging: false,
        receiving: false,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(shown.rootEl.textContent).toContain('staging');
    await shown.unmount();

    const hidden = await mount(
      createElement(MonolithNode, {
        layer: LAYER,
        at: AT,
        count: 2,
        dimmed: false,
        dragging: true,
        receiving: false,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(hidden.rootEl.textContent).not.toContain('staging');
    await hidden.unmount();
  });

  it('a node that is only a receiving drop target keeps its label', async () => {
    const probe = await mount(
      createElement(VisionNode, {
        vision: VISION,
        at: AT,
        kinds: ['ssh'],
        dimmed: false,
        dragging: false,
        receiving: true,
        onPointerDown: noop,
        onContextMenu: noop,
        onKeyOpen: noop,
      }),
    );
    expect(probe.rootEl.textContent).toContain('prod');
    await probe.unmount();
  });
});
