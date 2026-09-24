// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * `fitAll` had no labelled affordance, reachable only by double-clicking
 * empty canvas (#457). Its siblings `recenter` and `fitVision` both sit
 * behind a labelled button; this pins the same for `fitAll`, in the shared
 * toolbar (ADR-0069) where `recenter`'s own button already lives.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { MapToolbarControls } = await import('../src/components/map/MapToolbarControls');

async function mount(onFitAll: () => void = () => {}, onRecenter: () => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(
      createElement(MapToolbarControls, {
        query: '',
        onQueryChange: () => {},
        onQuerySubmit: () => {},
        zoomPercent: 100,
        onRecenter,
        onFitAll,
      }),
    );
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the map toolbar', () => {
  it('offers a labelled Fit all button', async () => {
    const probe = await mount();

    const buttons = [...probe.rootEl.querySelectorAll('button')];
    const fitAll = buttons.find((button) => button.textContent === 'Fit all');
    expect(fitAll).not.toBeUndefined();

    await probe.unmount();
  });

  it('calls onFitAll when the Fit all button is clicked', async () => {
    const onFitAll = vi.fn();
    const probe = await mount(onFitAll);

    const buttons = [...probe.rootEl.querySelectorAll('button')];
    const fitAll = buttons.find((button) => button.textContent === 'Fit all');
    if (fitAll === undefined) throw new Error('expected a Fit all button');

    await act(async () => {
      fitAll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onFitAll).toHaveBeenCalled();
    await probe.unmount();
  });

  it('still calls onRecenter when the Recenter button is clicked', async () => {
    const onRecenter = vi.fn();
    const probe = await mount(() => {}, onRecenter);

    const buttons = [...probe.rootEl.querySelectorAll('button')];
    const recenter = buttons.find((button) => button.textContent === 'Recenter');
    if (recenter === undefined) throw new Error('expected a Recenter button');

    await act(async () => {
      recenter.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRecenter).toHaveBeenCalled();
    await probe.unmount();
  });
});
