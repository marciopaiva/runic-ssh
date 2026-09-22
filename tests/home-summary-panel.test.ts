// @vitest-environment jsdom
//
// The row-based content ADR-0052 keeps for Home when nothing is selected:
// the saved/connected counts already covered by other tests' fixtures,
// plus this file's own reason to exist, the Bastions/Direct breakdown and
// the macros row that route to `MacrosSidebar` from Home for the first
// time.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConnectionKind, LiveSession } from '../src/features/sessions/state';
import type { Macro } from '../src/ipc';
import { createTranslator } from '../src/lib/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translator = createTranslator('en');
vi.mock('../src/features/settings', () => ({ useTranslator: () => translator }));

const { HomeSummaryPanel } = await import('../src/components/HomeSummaryPanel');

function session(id: string, overrides: Partial<LiveSession['session']> = {}): LiveSession['session'] {
  return {
    id,
    name: id,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group: null,
    credentialId: null,
    proxyJump: null,
    kind: 'direct',
    forwards: [],
    ...overrides,
  };
}

function live(
  id: string,
  overrides: Partial<LiveSession['session']> = {},
  kind: ConnectionKind = 'saved',
): LiveSession {
  return { session: session(id, overrides), handle: null, kind };
}

function macro(id: string): Macro {
  return { id, name: `macro-${id}`, kind: 'sequential', text: 'echo hi' };
}

let containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers) container.remove();
  containers = [];
  vi.restoreAllMocks();
});

async function mount(
  sessions: readonly LiveSession[],
  macros: readonly Macro[],
  onOpenMacros: () => void = () => {},
  onActivateSession: (sessionId: string) => void = () => {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(HomeSummaryPanel, { sessions, macros, onOpenMacros, onActivateSession }));
  });

  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

describe('the Home summary panel', () => {
  it('breaks saved hosts down into direct and jump-server counts', async () => {
    const sessions = [
      live('bastion', { kind: 'jumpServer' }),
      live('target', { proxyJump: 'bastion', kind: 'target' }),
      live('dev-web', { kind: 'direct' }),
      live('dev-db', { kind: 'direct' }),
    ];

    const probe = await mount(sessions, []);

    // `bastions` holds every row under that section, the jump server itself
    // and the target riding it, so one jump server with one rider counts as
    // two here, same as `HostsSection`'s own list would show.
    expect(probe.container.textContent).toContain('2 direct');
    expect(probe.container.textContent).toContain('2 jump servers');

    await probe.unmount();
  });

  it('omits the breakdown line when no hosts are saved', async () => {
    const probe = await mount([], []);

    expect(probe.container.textContent).not.toContain('direct');
    expect(probe.container.textContent).not.toContain('jump server');

    await probe.unmount();
  });

  it('shows a macro count of zero and still offers to manage them', async () => {
    const probe = await mount([], []);

    expect(probe.container.textContent).toContain('0 macros saved');
    const button = probe.container.querySelector('button');
    expect(button?.textContent).toBe('Manage macros');

    await probe.unmount();
  });

  it('pluralizes a single saved macro', async () => {
    const probe = await mount([], [macro('a')]);

    expect(probe.container.textContent).toContain('1 macro saved');

    await probe.unmount();
  });

  it('counts several saved macros', async () => {
    const probe = await mount([], [macro('a'), macro('b'), macro('c')]);

    expect(probe.container.textContent).toContain('3 macros saved');

    await probe.unmount();
  });

  it('calls onOpenMacros when the manage button is clicked', async () => {
    const onOpenMacros = vi.fn();
    const probe = await mount([], [macro('a')], onOpenMacros);

    const button = probe.container.querySelector('button');
    if (button === null) throw new Error('expected a button');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenMacros).toHaveBeenCalled();

    await probe.unmount();
  });

  it('jumps to a connected session when its row is clicked', async () => {
    const onActivateSession = vi.fn();
    const sessions = [live('web-1', {}, 'connected')];

    const probe = await mount(sessions, [], () => {}, onActivateSession);

    const button = probe.container.querySelector('button[aria-label="Open web-1 in Sessions"]');
    if (button === null) throw new Error('expected a row for the connected session');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onActivateSession).toHaveBeenCalledWith('web-1');

    await probe.unmount();
  });
});
