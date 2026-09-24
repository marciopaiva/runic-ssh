// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * `useEscapeRouter` (ADR-0068 follow-up, #387): one `window` listener while
 * anything is active, dropped the moment nothing is, and only the
 * highest-priority active layer answers a given Escape press.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { useEscapeRouter } from '../src/features/map/escape-router';
import type { EscapeLayer } from '../src/features/map/escape-router';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

function Harness({ layers }: { readonly layers: readonly EscapeLayer[] }): null {
  useEscapeRouter(layers);
  return null;
}

async function mount(layers: readonly EscapeLayer[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness, { layers }));
  });
  return {
    async rerender(next: readonly EscapeLayer[]) {
      await act(async () => {
        root.render(createElement(Harness, { layers: next }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe('useEscapeRouter', () => {
  it('adds no listener while every layer is inactive', async () => {
    let calls = 0;
    const harness = await mount([{ active: false, onEscape: () => calls++ }]);
    pressEscape();
    expect(calls).toBe(0);
    await harness.unmount();
  });

  it('answers with the first active layer, not a lower one', async () => {
    const order: string[] = [];
    const harness = await mount([
      { active: false, onEscape: () => order.push('top') },
      { active: true, onEscape: () => order.push('middle') },
      { active: true, onEscape: () => order.push('bottom') },
    ]);
    pressEscape();
    expect(order).toEqual(['middle']);
    await harness.unmount();
  });

  it('tracks a layer becoming active without a stale closure', async () => {
    const order: string[] = [];
    const harness = await mount([{ active: false, onEscape: () => order.push('first') }]);
    await harness.rerender([{ active: true, onEscape: () => order.push('second') }]);
    pressEscape();
    expect(order).toEqual(['second']);
    await harness.unmount();
  });

  it('removes the listener on unmount', async () => {
    let calls = 0;
    const harness = await mount([{ active: true, onEscape: () => calls++ }]);
    await harness.unmount();
    pressEscape();
    expect(calls).toBe(0);
  });
});
