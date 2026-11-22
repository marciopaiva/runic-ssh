// @vitest-environment jsdom
//
// "The terminal's folder" on a remote SFTP pane: unknown until the shell
// reports one (OSC 7), then a click lists that folder on the same connection.
// The IPC is mocked; the OSC parsing itself is in `terminal-cwd.test.ts`.

import { readFileSync } from 'node:fs';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = JSON.parse(readFileSync('src/locales/en.json', 'utf8')) as Record<string, string>;

vi.mock('../src/features/settings', () => ({
  useTranslator: () => ({
    t: (key: string) => catalog[key] ?? key,
  }),
}));

const sftpList = vi.fn(async (..._args: unknown[]) => []);
vi.mock('../src/ipc', () => ({
  sftpList: (...args: unknown[]) => sftpList(...args),
  asIpcError: () => undefined,
}));

const { SftpPane } = await import('../src/components/SftpPane');
const { reportTerminalCwd, forgetTerminalCwd } = await import('../src/features/terminal/cwd');

const roots: Array<ReturnType<typeof createRoot>> = [];

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(SftpPane, {
        endpoint: { kind: 'remote', sessionId: 's1', handle: 9 as never },
        paneId: 'p',
        label: 'Source',
        identity: 'web-01',
        onReport: () => {},
        onSend: null,
        onClear: () => {},
        receiving: null,
        onToggleReceiving: null,
        onDragEntriesStart: null,
        onDragEntriesEnd: null,
      }),
    );
  });
}

const folderButton = (): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === "Go to the terminal's folder",
  );

beforeEach(() => {
  sftpList.mockClear();
  document.body.innerHTML = '';
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  forgetTerminalCwd(9);
});

describe('the terminal folder button', () => {
  it('explains how to get a folder when the shell never reported one', async () => {
    await mount();

    await act(async () => {
      folderButton()?.click();
    });

    expect(document.body.textContent).toContain('~/.bashrc');
    expect(sftpList).toHaveBeenCalledTimes(1);
  });

  it('lists the reported folder on the same connection', async () => {
    await mount();
    await act(async () => {
      reportTerminalCwd(9, '/var/www');
    });

    await act(async () => {
      folderButton()?.click();
    });

    expect(sftpList).toHaveBeenLastCalledWith(9, '/var/www');
    expect(document.body.textContent).not.toContain('~/.bashrc');
  });
});
