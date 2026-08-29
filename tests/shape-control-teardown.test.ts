// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * `ShapeControl`'s own dismiss listener, unregistered whenever the popover
 * closes, not only on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. This
 * effect only exists while `open` is true, so it is torn down twice over the
 * life of one mounted control: once when a choice or an outside click closes
 * the popover, and again if the control itself unmounts while it is still
 * open. Both are load-bearing: the first is the ordinary path, and a hook
 * whose cleanup only fires at unmount is exactly the class of bug section 6
 * exists to catch. An early `return`, here the `!open` guard, silently
 * skips the registration the cleanup was written for.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { ShapeControl } = await import('../src/components/ShapeControl');

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(ShapeControl, { layout: '1x1', onChoose: () => {}, canSplit: true }));
  });

  const toggle = rootEl.querySelector('button[aria-haspopup="true"]');
  if (toggle === null) throw new Error('ShapeControl did not render its toggle button');

  const click = async (): Promise<void> => {
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  return {
    click,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

let addEventListener: ReturnType<typeof vi.spyOn>;
let removeEventListener: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addEventListener = vi.spyOn(document, 'addEventListener');
  removeEventListener = vi.spyOn(document, 'removeEventListener');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what closing the shape popover releases', () => {
  it('registers no listener while it is closed', async () => {
    await mountProbe();

    expect(addEventListener).not.toHaveBeenCalledWith('mousedown', expect.any(Function));
  });

  it('removes the outside-click listener when the same click that opened it toggles it shut', async () => {
    const probe = await mountProbe();

    await probe.click();
    expect(addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    const registered = addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'mousedown')?.[1];

    await probe.click();
    expect(removeEventListener).toHaveBeenCalledWith('mousedown', registered);
  });

  it('removes the listener on unmount if it is still open', async () => {
    const probe = await mountProbe();

    await probe.click();
    const registered = addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'mousedown')?.[1];

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('mousedown', registered);
  });
});
