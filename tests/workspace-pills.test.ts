// @vitest-environment jsdom
//
// Scoped to this file rather than set in `vite.config.ts`: see
// `shape-control-teardown.test.ts` for why jsdom is opted in per file.

/**
 * The map pill ADR-0073 added, always present next to SSH and SFTP, and
 * ADR-0075 made it reflect selection like its siblings once the map became
 * an ordinary workspace value. The Home pill (ADR-0072 addendum) is the same
 * shape: Home has no rail slot of its own, so this row is its only way in
 * or out.
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
  workspace: 'home' | 'sessions' | 'sftp' | 'map',
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

describe('the map pill', () => {
  it('renders alongside Home, SSH and SFTP', async () => {
    const probe = await mount('sessions');

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    expect(tabs.length).toBe(4);

    await probe.unmount();
  });

  it('reflects selection like SSH and SFTP', async () => {
    for (const [workspace, selected] of [
      ['sessions', 'false'],
      ['sftp', 'false'],
      ['map', 'true'],
    ] as const) {
      const probe = await mount(workspace);

      const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
      const mapTab = tabs[tabs.length - 1];
      if (mapTab === undefined) throw new Error('expected a fourth tab');
      expect(mapTab.getAttribute('aria-selected')).toBe(selected);

      await probe.unmount();
    }
  });

  it('calls onChoose with "map" when clicked', async () => {
    const onChoose = vi.fn();
    const probe = await mount('sessions', onChoose);

    const tabs = Array.from(probe.rootEl.querySelectorAll('button[role="tab"]'));
    const mapTab = tabs[tabs.length - 1];
    if (mapTab === undefined) throw new Error('expected a fourth tab');

    await act(async () => {
      mapTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChoose).toHaveBeenCalledWith('map');

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

describe("the map's own toolbar carries the same pills (ADR-0075)", () => {
  /* Caught in manual verification, not by any automated test: folding the
     map into `workspace` made it reachable from SSH and SFTP, but its own
     `<Toolbar>` branch kept the pre-fold leading content (just `MapCrumb`),
     which left no way back to either in one click. `WorkspacePills` renders
     in every other workspace's own row; this pins that the map's does too,
     so a later edit that drops it again fails here instead of only in a
     screenshot. */
  const source = readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it("mounts WorkspacePills in the map's own toolbarLeading branch", () => {
    const mapBranch = source.indexOf("workspace === 'map' ? (", source.indexOf('const toolbarLeading ='));
    const nextBranch = source.indexOf(") : workspace === 'home' ? (", mapBranch);
    expect(mapBranch, 'the map branch of toolbarLeading').toBeGreaterThan(-1);
    expect(nextBranch, 'the end of toolbarLeading').toBeGreaterThan(mapBranch);

    const branchSource = source.slice(mapBranch, nextBranch);
    expect(branchSource).toContain('<WorkspacePills workspace="map"');
  });

  it("mounts WorkspacePills in Home's own toolbarLeading branch", () => {
    const homeBranch = source.indexOf("workspace === 'home' ? (", source.indexOf('const toolbarLeading ='));
    const nextBranch = source.indexOf(') : undefined;', homeBranch);
    expect(homeBranch, 'the home branch of toolbarLeading').toBeGreaterThan(-1);
    expect(nextBranch, 'the end of toolbarLeading').toBeGreaterThan(homeBranch);

    const branchSource = source.slice(homeBranch, nextBranch);
    expect(branchSource).toContain('<WorkspacePills workspace="home"');
  });
});
