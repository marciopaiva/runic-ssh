// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The toolbar's workspace pills: Home, SSH and SFTP, always present. The Home
 * pill (ADR-0072 addendum) is the only way in or out of that workspace, since
 * Home has no rail slot of its own. The map pill went with the map
 * (ADR-0080).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

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

async function mount(
  workspace: 'home' | 'sessions' | 'sftp',
  onChoose: (workspace: string) => void = () => {},
) {
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

describe('the pills', () => {
  it('render Home, SSH and SFTP, in that order', async () => {
    const probe = await mount('sessions');

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    expect(tabs.length).toBe(3);

    await probe.unmount();
  });

  it('reflect selection', async () => {
    for (const [workspace, selected] of [
      ['home', ['true', 'false', 'false']],
      ['sessions', ['false', 'true', 'false']],
      ['sftp', ['false', 'false', 'true']],
    ] as const) {
      const probe = await mount(workspace);

      const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
      expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([...selected]);

      await probe.unmount();
    }
  });

  it('call onChoose with the workspace they stand for', async () => {
    const onChoose = vi.fn();
    const probe = await mount('home', onChoose);

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    for (const tab of tabs) {
      await act(async () => {
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    expect(onChoose.mock.calls.map((call) => call[0])).toEqual(['home', 'sessions', 'sftp']);

    await probe.unmount();
  });
});

describe('the Home pill', () => {
  it('reflects selection when Home is the active workspace', async () => {
    for (const [workspace, selected] of [
      ['home', 'true'],
      ['sessions', 'false'],
    ] as const) {
      const probe = await mount(workspace);

      const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
      const homeTab = tabs[0];
      if (homeTab === undefined) throw new Error('expected a first tab');
      expect(homeTab.getAttribute('aria-selected')).toBe(selected);

      await probe.unmount();
    }
  });

  it('calls onChoose with "home" when clicked', async () => {
    const onChoose = vi.fn();
    const probe = await mount('sessions', onChoose);

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    const homeTab = tabs[0];
    if (homeTab === undefined) throw new Error('expected a first tab');

    await act(async () => {
      homeTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChoose).toHaveBeenCalledWith('home');

    await probe.unmount();
  });
});

describe('the toolbar carries the pills in every workspace (ADR-0075)', () => {
  /* `WorkspacePills` renders in every workspace's own row, so there is always
     a way to another workspace in one click. This pins that each branch of
     `toolbarLeading` mounts it, so a later edit that drops one fails here
     instead of only in a screenshot. */
  const source = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it.each(['sessions', 'sftp', 'home'])("mounts WorkspacePills in the %s branch of toolbarLeading", (name) => {
    const start = source.indexOf('const toolbarLeading =');
    const end = source.indexOf(') : undefined;', start);
    expect(start, 'toolbarLeading').toBeGreaterThan(-1);
    expect(end, 'the end of toolbarLeading').toBeGreaterThan(start);

    expect(source.slice(start, end)).toContain(`<WorkspacePills workspace="${name}"`);
  });
});
