// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * ADR-0005's escape hatch (native vs. drawn title bar), given a toolbar
 * route now that the general palette command `chrome:decorations` is gone,
 * its only route until now.
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

const { DecorationsButton } = await import('../src/components/DecorationsButton');

async function mount(native: boolean, onToggle: () => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(DecorationsButton, { native, onToggle }));
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

describe('the decorations button', () => {
  it('is pressed when the title bar is drawn, not native', async () => {
    const probe = await mount(false);

    const button = probe.rootEl.querySelector('button');
    if (button === null) throw new Error('expected a button');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    await probe.unmount();
  });

  it('is not pressed while the title bar is native', async () => {
    const probe = await mount(true);

    const button = probe.rootEl.querySelector('button');
    if (button === null) throw new Error('expected a button');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await probe.unmount();
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const probe = await mount(true, onToggle);

    const button = probe.rootEl.querySelector('button');
    if (button === null) throw new Error('expected a button');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalled();

    await probe.unmount();
  });
});
