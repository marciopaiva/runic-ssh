// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: every other test
// in this directory resolves a path with `fileURLToPath(new URL(...,
// import.meta.url))`, and jsdom's `URL` disagrees with Node's about what that
// resolves to. Turning it on globally broke thirteen files that never touch a
// DOM.

/**
 * The credential window's Escape listener, unregistered on unmount.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. The
 * effect carries no dependency array, so it re-registers after every render;
 * what has to hold regardless is that the copy left on the document once the
 * window is gone is nothing; a leaked handler here would go on answering
 * Escape in a document that no longer has a `cancel` to call.
 *
 * `request: null` renders the failure branch, which needs no prompt fetched
 * and no field filled, and mounts the same Escape effect the working prompt
 * does.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const credential = vi.hoisted(() => ({
  credentialPrompt: vi.fn(),
  dismissCredential: vi.fn(async () => {}),
  submitCredential: vi.fn(async () => {}),
}));

vi.mock('../src/ipc/credential', () => credential);
vi.mock('../src/ipc/errors', () => ({ asIpcError: () => undefined }));

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { CredentialWindow } = await import('../src/credential/CredentialWindow');

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(CredentialWindow, { request: null }));
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
  credential.credentialPrompt.mockReset();
});

describe('what unmounting the credential window releases', () => {
  it('removes the Escape listener the failure screen registered', async () => {
    /* No dependency array: the effect re-registers after every render, and
       `request === null` settles into the failure screen over two of them.
       The handler in force right before unmount is the last one added, not
       the first, so that is the one the teardown has to be checked against. */
    const probe = await mountProbe();

    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    const keydownCalls = addEventListener.mock.calls.filter((call: unknown[]) => call[0] === 'keydown');
    const registered = keydownCalls.at(-1)?.[1];

    await probe.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('keydown', registered);
  });
});
