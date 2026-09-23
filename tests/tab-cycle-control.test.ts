// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * Cross-group tab cycling, given a toolbar route now that the general
 * palette's `tab:next`/`tab:previous` are gone: arrow keys still move focus
 * within a group, but nothing else moves it between groups.
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

const { TabCycleControl } = await import('../src/components/TabCycleControl');

async function mount(onPrevious: () => void = () => {}, onNext: () => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(TabCycleControl, { onPrevious, onNext }));
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

describe('the tab cycle control', () => {
  it('renders a previous and a next button', async () => {
    const probe = await mount();

    expect(probe.rootEl.querySelectorAll('button').length).toBe(2);

    await probe.unmount();
  });

  it('calls onPrevious when the first button is clicked', async () => {
    const onPrevious = vi.fn();
    const probe = await mount(onPrevious);

    const [previous] = Array.from(probe.rootEl.querySelectorAll('button'));
    if (previous === undefined) throw new Error('expected a previous button');

    await act(async () => {
      previous.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onPrevious).toHaveBeenCalled();

    await probe.unmount();
  });

  it('calls onNext when the second button is clicked', async () => {
    const onNext = vi.fn();
    const probe = await mount(() => {}, onNext);

    const buttons = Array.from(probe.rootEl.querySelectorAll('button'));
    const next = buttons[1];
    if (next === undefined) throw new Error('expected a next button');

    await act(async () => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNext).toHaveBeenCalled();

    await probe.unmount();
  });
});
