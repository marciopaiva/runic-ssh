// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * `SessionMenu`'s own dismiss listener, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. A menu
 * that leaves its `mousedown` listener behind keeps calling `onDismiss` for a
 * row that closed it, which reads as a click somewhere else in the window
 * dismissing whatever opens next.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveSession } from '../src/features/sessions';
import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { SessionMenu } = await import('../src/components/SessionMenu');

function live(): LiveSession {
  return {
    session: {
      id: 'a',
      name: 'docker',
      host: '127.0.0.1',
      port: 22,
      user: 'deploy',
      group: null,
      credentialId: null,
      proxyJump: null,
      kind: 'other',
    },
    handle: null,
    kind: 'saved',
  };
}

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(
      createElement(SessionMenu, {
        live: live(),
        at: { x: 10, y: 10 },
        onChoose: () => {},
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

describe('what unmounting the session menu releases', () => {
  it('removes the outside-click listener it added', async () => {
    const probe = await mountProbe();

    expect(addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    const registered = addEventListener.mock.calls.find((call: unknown[]) => call[0] === 'mousedown')?.[1];

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('mousedown', registered);
  });
});
