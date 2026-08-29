// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * `GroupMenu`'s own dismiss listener, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. Same
 * shape as `session-menu-teardown.test.ts`: a menu that leaves its
 * `mousedown` listener behind keeps calling `onDismiss` for a strip that
 * closed it.
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

const { GroupMenu } = await import('../src/components/GroupMenu');

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(
      createElement(GroupMenu, {
        items: [{ id: 'a', label: 'Close group', run: () => {} }],
        at: { x: 10, y: 10 },
        label: 'Group actions',
        onDismiss: () => {},
      }),
    );
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

describe('what unmounting the group menu releases', () => {
  it('removes the outside-click listener it added', async () => {
    const probe = await mountProbe();

    expect(addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    const registered = addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'mousedown')?.[1];

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('mousedown', registered);
  });
});
