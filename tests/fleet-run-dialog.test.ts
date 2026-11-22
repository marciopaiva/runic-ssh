// @vitest-environment jsdom
//
// The dialog is where ADR-0078's promises meet the person: nothing runs until
// they confirm, the script and every host are shown first, and what comes
// back is grouped with the differing lines marked. The IPC is mocked, so this
// proves the flow and the rendering, not the run itself (that is the OpenSSH
// test in `src-tauri/tests/against_openssh.rs`).

import { readFileSync } from 'node:fs';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const catalog = JSON.parse(
  readFileSync('src/locales/en.json', 'utf8'),
) as Record<string, string>;

vi.mock('../src/features/settings', () => ({
  useTranslator: () => ({
    t: (key: string, params: Record<string, string | number> = {}) =>
      (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name])),
  }),
}));

const fleetRun = vi.fn();
vi.mock('../src/ipc/fleet', () => ({ fleetRun: (...args: unknown[]) => fleetRun(...args) }));

const { FleetRunDialog } = await import('../src/components/FleetRunDialog');

const macro = { id: 'm1', name: 'kernel', kind: 'script' as const, text: 'uname -r' };
const targets = [
  { handle: 1 as never, name: 'web-01', address: 'deploy@10.0.0.1:22' },
  { handle: 2 as never, name: 'web-02', address: 'deploy@10.0.0.2:22' },
  { handle: 3 as never, name: 'web-03', address: 'deploy@10.0.0.3:22' },
];

function ran(handle: number, stdout: string) {
  return { handle, state: 'ran', stdout, stderr: '', exitStatus: 0, truncated: false, timedOut: false };
}

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(FleetRunDialog, { macro, targets, onClose: () => {} }));
  });
  return () => document.body;
}

const click = async (label: RegExp): Promise<void> => {
  const button = [...document.body.querySelectorAll('button')].find((b) => label.test(b.textContent ?? ''));
  if (button === undefined) throw new Error(`no button matching ${label}`);
  await act(async () => {
    button.click();
  });
};

beforeEach(() => {
  fleetRun.mockReset();
  document.body.innerHTML = '';
});

describe('FleetRunDialog', () => {
  it('shows the script and every host, and sends nothing before the person confirms', async () => {
    const body = await mount();

    expect(body().textContent).toContain('uname -r');
    for (const target of targets) expect(body().textContent).toContain(target.name);
    expect(fleetRun).not.toHaveBeenCalled();
  });

  it('runs only the ticked hosts, by macro id and handle, never by text', async () => {
    fleetRun.mockResolvedValue([ran(1, 'a\n'), ran(3, 'a\n')]);
    const body = await mount();

    const second = body().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
    await act(async () => {
      second?.click();
    });
    await click(/Run on 2 hosts/);

    expect(fleetRun).toHaveBeenCalledTimes(1);
    expect(fleetRun).toHaveBeenCalledWith('m1', [1, 3]);
  });

  it('groups identical answers, puts the largest first and marks a differing line', async () => {
    fleetRun.mockResolvedValue([ran(1, '6.1\nok'), ran(2, '6.1\nBAD'), ran(3, '6.1\nok')]);
    await mount();

    await click(/Run on 3 hosts/);

    const text = document.body.textContent ?? '';
    expect(text).toContain('Most common answer');
    expect(text).toContain('2 of 3 hosts');
    expect(text).toContain('Differs from the most common answer');
    expect(text).toContain('1 of 3 hosts');
    expect(document.body.querySelectorAll('.border-warn.block')).toHaveLength(1);
  });

  it('draws an escape sequence from a host as text instead of obeying it', async () => {
    fleetRun.mockResolvedValue([ran(1, 'x\u001b[31mred')]);
    await mount();

    await click(/Run on 3 hosts/);

    expect(document.body.textContent).toContain('x\\x1b[31mred');
  });

  it('names a host that gave nothing to compare', async () => {
    fleetRun.mockResolvedValue([ran(1, 'a'), { handle: 2, state: 'failed' }]);
    await mount();

    await click(/Run on 3 hosts/);

    expect(document.body.textContent).toContain('Could not run on: web-02');
  });

  it('says so and stays on the confirmation when the run is refused', async () => {
    fleetRun.mockRejectedValue({ code: 'macroNotScript', id: 'm1' });
    await mount();

    await click(/Run on 3 hosts/);

    expect(document.body.textContent).toContain('Only a script macro can run on several hosts.');
    expect(document.body.textContent).toContain('uname -r');
  });
});
