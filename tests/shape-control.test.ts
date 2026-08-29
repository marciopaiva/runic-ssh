// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The refusal `shapes.ts` documents and the palette (`sources.ts`) already
 * carries: with no session open anywhere, a shape wider than `1x1` would draw
 * a rectangle with nothing to put in it. Before this test existed, this
 * control never carried that refusal at all: dividing a window holding only
 * settings drew an empty rectangle captioned "drag a host here" beside a
 * settings form, which is exactly the interface ADR-0020 rule 6 refuses.
 *
 * Two shapes for the refusal, matching the two states the palette already
 * tells apart: undivided with nothing open has no split command at all, so
 * this control renders nothing either; already divided with nothing open
 * still needs a way back to one rectangle, so the control stays and only the
 * wider shapes are disabled.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';
import { GRIDS } from '../src/features/terminal';
import type { Grid } from '../src/features/terminal';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { ShapeControl } = await import('../src/components/ShapeControl');

async function mount(layout: Grid, canSplit: boolean, onChoose: (kind: Grid) => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(ShapeControl, { layout, onChoose, canSplit }));
  });

  return {
    rootEl,
    async open() {
      const toggle = rootEl.querySelector('button[aria-haspopup="true"]');
      if (toggle === null) throw new Error('ShapeControl did not render its toggle button');
      await act(async () => {
        toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    },
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

describe('undivided with nothing open', () => {
  it('renders nothing at all', async () => {
    const probe = await mount('1x1', false);

    expect(probe.rootEl.querySelector('button[aria-haspopup="true"]')).toBeNull();

    await probe.unmount();
  });
});

describe('already divided with nothing open', () => {
  it('stays visible', async () => {
    const probe = await mount('2x1', false);

    expect(probe.rootEl.querySelector('button[aria-haspopup="true"]')).not.toBeNull();

    await probe.unmount();
  });

  it('disables every shape except the one in use and the way back to one rectangle', async () => {
    const layout: Grid = '2x1';
    const probe = await mount(layout, false);
    await probe.open();

    const buttons = Array.from(probe.rootEl.querySelectorAll('button[role="menuitemradio"]'));
    expect(buttons.length).toBe(GRIDS.length);

    GRIDS.forEach((kind, at) => {
      const button = buttons[at];
      if (button === undefined) throw new Error(`no button rendered for ${kind}`);

      const exempt = kind === '1x1' || kind === layout;
      expect(button.hasAttribute('disabled')).toBe(!exempt);
    });

    await probe.unmount();
  });

  it('never disables the shape already in use, even though it is not 1x1', async () => {
    const probe = await mount('2x1', false);
    await probe.open();

    const current = probe.rootEl.querySelector('button[role="menuitemradio"][aria-checked="true"]');
    expect(current?.hasAttribute('disabled')).toBe(false);

    await probe.unmount();
  });

  it('does not run onChoose for a disabled shape', async () => {
    const onChoose = vi.fn();
    const probe = await mount('2x1', false, onChoose);
    await probe.open();

    const locked = probe.rootEl.querySelector('button[role="menuitemradio"][disabled]');
    expect(locked).not.toBeNull();

    await act(async () => {
      locked?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChoose).not.toHaveBeenCalled();

    await probe.unmount();
  });
});

describe('a session open somewhere', () => {
  it('enables every shape', async () => {
    const probe = await mount('1x1', true);
    await probe.open();

    const buttons = probe.rootEl.querySelectorAll('button[role="menuitemradio"]');
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.hasAttribute('disabled')).toBe(false);
    }

    await probe.unmount();
  });
});
