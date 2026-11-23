// @vitest-environment jsdom
//
// The tab-sized sigil: bright only for a live connection.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { SigilBadge } = await import('../src/components/SigilMark');

const roots: Array<ReturnType<typeof createRoot>> = [];

async function paths(live: boolean): Promise<string[]> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(createElement(SigilBadge, { id: 'fx2', live })));
  return [...host.querySelectorAll('path')].map((p) => p.getAttribute('class') ?? '');
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
});

describe('SigilBadge', () => {
  it('is faint for a host that is not connected', async () => {
    const classes = await paths(false);

    expect(classes.length).toBeGreaterThan(4);
    expect(classes.every((c) => c.includes('stroke-ink-disabled'))).toBe(true);
  });

  it('takes the brand colours for a live connection', async () => {
    const classes = await paths(true);

    expect(classes.some((c) => c.includes('stroke-brand-rune'))).toBe(true);
    expect(classes.some((c) => c.includes('stroke-ink-disabled'))).toBe(false);
  });

  it('is cut once when a connection comes up, not for a host already live', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const cutCount = (): number => host.querySelectorAll('path.sigil-cut').length;

    await act(async () => root.render(createElement(SigilBadge, { id: 'fx2', live: false })));
    expect(cutCount()).toBe(0);

    await act(async () => root.render(createElement(SigilBadge, { id: 'fx2', live: true })));
    expect(cutCount()).toBeGreaterThan(4);

    const alreadyLive = document.createElement('div');
    document.body.appendChild(alreadyLive);
    const second = createRoot(alreadyLive);
    roots.push(second);
    await act(async () => second.render(createElement(SigilBadge, { id: 'fx2', live: true })));
    expect(alreadyLive.querySelectorAll('path.sigil-cut').length).toBe(0);
  });
});
