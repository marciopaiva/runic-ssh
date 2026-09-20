// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The prompt ADR-0073 shows in place of the map when `previewFeatures` is
 * off. It is requested, not unbidden, so it renders through `SessionSurface`
 * without `role="alert"`, unlike `HostKeyBlocked` and its siblings.
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

const { MapPreviewPrompt } = await import('../src/components/MapPreviewPrompt');

async function mount(onAccept: () => void = () => {}, onCancel: () => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(MapPreviewPrompt, { onAccept, onCancel }));
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

describe('MapPreviewPrompt', () => {
  it('renders as a requested surface, not an unbidden alert', async () => {
    const probe = await mount();

    expect(probe.rootEl.querySelector('section[aria-labelledby]')).not.toBeNull();
    expect(probe.rootEl.querySelector('[role="alert"]')).toBeNull();

    await probe.unmount();
  });

  it('runs onAccept from its primary action', async () => {
    const onAccept = vi.fn();
    const probe = await mount(onAccept);

    const buttons = Array.from(probe.rootEl.querySelectorAll('button'));
    const accept = buttons.find((button) => button.textContent === translator.t('shell.preview.accept'));
    if (accept === undefined) throw new Error('expected an accept button');

    await act(async () => {
      accept.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAccept).toHaveBeenCalled();

    await probe.unmount();
  });

  it('runs onCancel from its secondary action', async () => {
    const onCancel = vi.fn();
    const probe = await mount(() => {}, onCancel);

    const buttons = Array.from(probe.rootEl.querySelectorAll('button'));
    const cancel = buttons.find((button) => button.textContent === translator.t('shell.preview.cancel'));
    if (cancel === undefined) throw new Error('expected a cancel button');

    await act(async () => {
      cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalled();

    await probe.unmount();
  });
});
