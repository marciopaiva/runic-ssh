// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * The palette's own shortcut listener, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs.
 * `usePalette` binds its shortcut on the document with `capture: true`, on
 * purpose, so the terminal cannot eat it first. A listener left behind after
 * a palette instance is gone would keep answering to a shortcut nothing is
 * showing any more.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { usePalette } = await import('../src/features/commands/use-palette');

function Probe(): null {
  usePalette([], 'control');
  return null;
}

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(Probe));
  });

  return {
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

describe('what unmounting the palette releases', () => {
  it('removes the capturing keydown listener it added', async () => {
    const probe = await mountProbe();

    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), {
      capture: true,
    });
    const registered = addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'keydown')?.[1];

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', registered, { capture: true });
  });
});
