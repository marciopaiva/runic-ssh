// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The control used to refuse a shape wider than `1x1` with no session open
 * anywhere, mirroring the palette (`sources.ts`). That guard existed to stop
 * a group showing settings from being split into a rectangle that lied about
 * what it held (ADR-0029). Sessions groups cannot hold anything but a session
 * any more, so the guard had nothing left to guard: ADR-0029's own Bad
 * section already named removing it as follow-up, and ADR-0021 had already
 * accepted dividing with nothing open as "a legitimate way to set up." This
 * now asserts the control is always visible and always fully enabled while
 * Sessions is the active workspace, whatever is or is not open.
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

async function mount(layout: Grid, onChoose: (kind: Grid) => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(ShapeControl, { layout, onChoose }));
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

describe('nothing open anywhere', () => {
  it('is visible undivided', async () => {
    const probe = await mount('1x1');

    expect(probe.rootEl.querySelector('button[aria-haspopup="true"]')).not.toBeNull();

    await probe.unmount();
  });

  it('offers every shape, none of them disabled', async () => {
    const layout: Grid = '2x1';
    const probe = await mount(layout);
    await probe.open();

    const buttons = Array.from(probe.rootEl.querySelectorAll('button[role="menuitemradio"]'));
    expect(buttons.length).toBe(GRIDS.length);

    for (const button of buttons) {
      expect(button.hasAttribute('disabled')).toBe(false);
    }

    await probe.unmount();
  });

  it('runs onChoose for a shape wider than the one in use', async () => {
    const onChoose = vi.fn();
    const probe = await mount('1x1', onChoose);
    await probe.open();

    const wider = probe.rootEl.querySelector(
      'button[role="menuitemradio"][aria-checked="false"]',
    );
    if (wider === null) throw new Error('expected a shape other than the one in use');

    await act(async () => {
      wider.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChoose).toHaveBeenCalled();

    await probe.unmount();
  });
});

describe('a session open somewhere', () => {
  it('enables every shape', async () => {
    const probe = await mount('1x1');
    await probe.open();

    const buttons = probe.rootEl.querySelectorAll('button[role="menuitemradio"]');
    expect(buttons.length).toBeGreaterThan(1);
    for (const button of buttons) {
      expect(button.hasAttribute('disabled')).toBe(false);
    }

    await probe.unmount();
  });
});
