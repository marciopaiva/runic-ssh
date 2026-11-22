// @vitest-environment jsdom
//
// ADR-0079: the banner a dropped session shows, and that the drop is reported
// once however often the parent renders.

import { readFileSync } from 'node:fs';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = JSON.parse(readFileSync('src/locales/en.json', 'utf8')) as Record<string, string>;

vi.mock('../src/features/settings', () => ({
  useTranslator: () => ({
    t: (key: string, params: Record<string, string> = {}) =>
      (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? ''),
  }),
}));

const terminalState = vi.hoisted(() => ({
  closed: true,
  exitStatus: null as number | null,
  connectionLost: true,
  size: null,
  focus: () => {},
  clipboard: { hasSelection: () => false, copy: () => false, paste: () => false },
}));
vi.mock('../src/features/terminal/use-terminal', () => ({ useTerminal: () => terminalState }));

const { TerminalView } = await import('../src/components/TerminalView');

type View = import('../src/features/sessions/reconnect').ReconnectView | null;

const roots: Array<ReturnType<typeof createRoot>> = [];

function props(extra: Record<string, unknown>) {
  return {
    handle: 1,
    session: null,
    sessions: [],
    visible: true,
    focused: true,
    frame: {},
    id: 'p',
    labelledBy: 't',
    onPaneFocus: () => {},
    onSize: () => {},
    onFocusHandle: () => {},
    modifier: 'control' as const,
    onPasteNeedsConfirming: () => {},
    onInput: () => {},
    broadcasting: false,
    ...extra,
  };
}

async function render(extra: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(createElement(TerminalView, props(extra) as never)));
  return {
    root,
    again: (more: Record<string, unknown>) =>
      act(async () => root.render(createElement(TerminalView, props(more) as never))),
  };
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
});

describe('the reconnect banner', () => {
  it('reports the drop once, even when the parent hands it a new callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = await render({ onConnectionLost: first });

    await view.again({ onConnectionLost: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('says which attempt it is on, and offers cancel but not reconnect', async () => {
    await render({
      reconnect: { phase: 'waiting', attempt: 3 } satisfies View,
      onReconnect: () => {},
      onCancelReconnect: () => {},
    });

    const text = document.body.textContent ?? '';
    expect(text).toContain('Reconnecting, attempt 3 of 8');
    expect(text).toContain('Cancel');
    expect([...document.body.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel']);
  });

  it('says why it stopped, and offers to reconnect', async () => {
    const onReconnect = vi.fn();
    await render({ reconnect: { phase: 'stopped', reason: 'hostKey' } satisfies View, onReconnect });

    expect(document.body.textContent).toContain('host key needs a decision');
    const button = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Reconnect');
    await act(async () => button?.click());
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
