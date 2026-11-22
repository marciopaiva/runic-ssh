// @vitest-environment jsdom
//
// The steps of connecting: what is ticked off has happened, the one under way
// is marked, and a failure marks where it stopped.

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
  useTranslator: () => ({ t: (key: string) => catalog[key] ?? key }),
}));

const { ConnectSteps } = await import('../src/components/ConnectSteps');

const roots: Array<ReturnType<typeof createRoot>> = [];

async function render(props: { step: 'reaching' | 'authenticating'; failed?: boolean }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(createElement(ConnectSteps, props)));
  return [...host.querySelectorAll('li')].map((li) => ({
    text: li.textContent ?? '',
    current: li.getAttribute('aria-current'),
  }));
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
});

describe('ConnectSteps', () => {
  it('marks the first step as under way while reaching the host', async () => {
    const [first, second] = await render({ step: 'reaching' });

    expect(first?.current).toBe('step');
    expect(first?.text).toContain('Reaching the host and checking its key');
    expect(first?.text.startsWith('›')).toBe(true);
    expect(second?.current).toBeNull();
    expect(second?.text.startsWith('·')).toBe(true);
  });

  it('ticks the first off once it is signing in', async () => {
    const [first, second] = await render({ step: 'authenticating' });

    expect(first?.text.startsWith('✓')).toBe(true);
    expect(second?.current).toBe('step');
  });

  it('marks the step it stopped in as failed and leaves the rest alone', async () => {
    const [first, second] = await render({ step: 'reaching', failed: true });

    expect(first?.text.startsWith('✕')).toBe(true);
    expect(first?.current).toBeNull();
    expect(second?.text.startsWith('·')).toBe(true);

    const [done, stopped] = await render({ step: 'authenticating', failed: true });
    expect(done?.text.startsWith('✓')).toBe(true);
    expect(stopped?.text.startsWith('✕')).toBe(true);
  });
});
