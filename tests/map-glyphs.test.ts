// @vitest-environment jsdom
//
// Scoped to this file for the reason `map-stage-teardown.test.ts` gives.

/**
 * `MonolithGlyph`, drawn on the same glass as its siblings (`KindGlyph`,
 * `RuneGlyph`, `ApertureGlyph`): an `<svg>` lifted by `drop-shadow`, not a
 * `<div>` with `box-shadow`.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { MonolithGlyph } from '../src/components/map/glyphs';

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

describe('MonolithGlyph', () => {
  it('draws on an svg, sized for the ring by default', async () => {
    const { rootEl, unmount } = await mount(createElement(MonolithGlyph, { count: 3 }));
    const svg = rootEl.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('78');
    expect(svg?.getAttribute('height')).toBe('108');
    expect((svg as unknown as SVGElement).style.filter).toContain('drop-shadow');
    await unmount();
  });

  it('grows for the hub', async () => {
    const { rootEl, unmount } = await mount(createElement(MonolithGlyph, { count: 3, hub: true }));
    const svg = rootEl.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('100');
    expect(svg?.getAttribute('height')).toBe('132');
    await unmount();
  });

  it('shows the count it was given', async () => {
    const { rootEl, unmount } = await mount(createElement(MonolithGlyph, { count: 7 }));
    expect(rootEl.querySelector('text')?.textContent).toBe('7');
    await unmount();
  });

  it('brightens its edge when highlighted', async () => {
    const plain = await mount(createElement(MonolithGlyph, { count: 1 }));
    const plainEdge = plain.rootEl.querySelector('.map-glyph-edge');
    expect(plainEdge?.getAttribute('stroke')).toBe('var(--rs-glass-edge-strong)');
    await plain.unmount();

    const highlighted = await mount(createElement(MonolithGlyph, { count: 1, highlighted: true }));
    const hotEdge = highlighted.rootEl.querySelector('.map-glyph-edge');
    expect(hotEdge?.getAttribute('stroke')).toBe('var(--rs-glass-edge-hot)');
    await highlighted.unmount();
  });
});
