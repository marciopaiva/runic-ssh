// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The map pill ADR-0073 added: always present next to SSH and SFTP, never
 * reflecting as the active tab (choosing it either leaves this workspace or
 * opens the preview prompt, neither of which `WorkspacePills` itself tracks).
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

const { WorkspacePills } = await import('../src/components/WorkspacePills');

async function mount(workspace: 'sessions' | 'sftp', onChoose: (workspace: string) => void = () => {}) {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(createElement(WorkspacePills, { workspace, onChoose }));
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

describe('the map pill', () => {
  it('renders alongside SSH and SFTP', async () => {
    const probe = await mount('sessions');

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    expect(tabs.length).toBe(3);

    await probe.unmount();
  });

  it('is never the selected tab', async () => {
    for (const workspace of ['sessions', 'sftp'] as const) {
      const probe = await mount(workspace);

      const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
      const mapTab = tabs[tabs.length - 1];
      if (mapTab === undefined) throw new Error('expected a third tab');
      expect(mapTab.getAttribute('aria-selected')).toBe('false');

      await probe.unmount();
    }
  });

  it('calls onChoose with "map" when clicked', async () => {
    const onChoose = vi.fn();
    const probe = await mount('sessions', onChoose);

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    const mapTab = tabs[tabs.length - 1];
    if (mapTab === undefined) throw new Error('expected a third tab');

    await act(async () => {
      mapTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChoose).toHaveBeenCalledWith('map');

    await probe.unmount();
  });
});
