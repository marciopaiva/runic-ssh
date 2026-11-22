// @vitest-environment jsdom
//
// Behind a jump host the core says when the jump host is ready, and the
// attempt moves to its second hop. A failure marks the hop it stopped at.

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
  useTranslator: () => ({ t: (key: string) => catalog[key] ?? key }),
}));

const stage = vi.hoisted(() => ({
  handler: null as null | ((event: { sessionId: string; stage: 'bastionReady' }) => void),
  stop: vi.fn(),
}));

const ipc = vi.hoisted(() => ({
  asIpcError: vi.fn((rejection: unknown) =>
    typeof rejection === 'object' && rejection !== null && typeof (rejection as { code?: unknown }).code === 'string'
      ? rejection
      : undefined,
  ),
  authenticateSession: vi.fn(async () => {}),
  authenticateWithSaved: vi.fn(async () => {}),
  connectSession: vi.fn(),
  credentialPrompt: vi.fn(async () => ({})),
  disconnectSession: vi.fn(async () => {}),
  dismissCredential: vi.fn(async () => {}),
  dismissHostKey: vi.fn(async () => {}),
  hostKeyDecision: vi.fn(async () => ({})),
  keepCredentialForRun: vi.fn(async () => {}),
  onInlineCredentialRequest: vi.fn(async () => () => {}),
  onConnectStage: vi.fn(async (handler: typeof stage.handler) => {
    stage.handler = handler;
    return stage.stop;
  }),
  rememberCredential: vi.fn(async () => {}),
  trustHostKey: vi.fn(async () => {}),
}));
vi.mock('../src/ipc', () => ipc);

const { useConnect } = await import('../src/features/sessions/use-connect');
const { ConnectSteps } = await import('../src/components/ConnectSteps');
type ConnectState = ReturnType<typeof useConnect>;

function Probe(props: { onState: (state: ConnectState) => void }): null {
  props.onState(
    useConnect({
      onOpened: () => {},
      onConnecting: () => {},
      onFailed: () => {},
      onAbandoned: () => {},
      onCredentialRefused: () => {},
      onCredentialSettled: () => {},
      onCredentialMissing: () => {},
    }),
  );
  return null;
}

const roots: Array<ReturnType<typeof createRoot>> = [];

beforeEach(() => {
  stage.handler = null;
  stage.stop.mockClear();
  ipc.connectSession.mockReset();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
});

async function mountProbe() {
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  let latest: ConnectState | null = null;
  await act(async () => root.render(createElement(Probe, { onState: (s) => (latest = s) })));
  return (): ConnectState => {
    if (latest === null) throw new Error('no state');
    return latest;
  };
}

describe('a chained connect', () => {
  it('moves to the second hop when the core says the jump host is ready, and listens no longer afterwards', async () => {
    let fail: (reason: unknown) => void = () => {};
    ipc.connectSession.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const state = await mountProbe();

    let running: Promise<void> = Promise.resolve();
    await act(async () => {
      running = state().connect('s1');
    });
    expect(state().attempts.get('s1')?.stage).toEqual({ stage: 'connecting', step: 'reaching' });

    await act(async () => stage.handler?.({ sessionId: 's1', stage: 'bastionReady' }));
    expect(state().attempts.get('s1')?.stage).toEqual({ stage: 'connecting', step: 'throughBastion' });

    /* Another session's event is not this attempt's. */
    await act(async () => stage.handler?.({ sessionId: 'other', stage: 'bastionReady' }));
    expect(state().attempts.get('s1')?.stage).toEqual({ stage: 'connecting', step: 'throughBastion' });

    await act(async () => {
      fail({ code: 'chainFailed', hop: 'target', inner: { code: 'hostUnreachable' } });
      await running;
    });

    expect(stage.stop).toHaveBeenCalled();
    expect(state().attempts.get('s1')?.stage).toMatchObject({ stage: 'failed', hop: 'target', step: 'throughBastion' });
  });

  it('marks the jump host as where it stopped when that is the hop that failed', async () => {
    ipc.connectSession.mockRejectedValue({ code: 'chainFailed', hop: 'bastion', inner: { code: 'hostUnreachable' } });
    const state = await mountProbe();

    await act(async () => {
      await state().connect('s1');
    });

    expect(state().attempts.get('s1')?.stage).toMatchObject({ stage: 'failed', hop: 'bastion', step: 'reaching' });
  });
});

describe('ConnectSteps behind a jump host', () => {
  async function items(step: 'reaching' | 'throughBastion' | 'authenticating', failed = false) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(createElement(ConnectSteps, { step, failed, chained: true })));
    return [...host.querySelectorAll('li')].map((li) => li.textContent ?? '');
  }

  it('lists a step for each hop and the sign in', async () => {
    const [first, second, third] = await items('throughBastion');

    expect(first).toContain('Reaching the jump host');
    expect(first?.startsWith('✓')).toBe(true);
    expect(second).toContain('through it');
    expect(second?.startsWith('›')).toBe(true);
    expect(third?.startsWith('·')).toBe(true);
  });

  it('marks the second hop as failed without touching the sign in', async () => {
    const [first, second, third] = await items('throughBastion', true);

    expect(first?.startsWith('✓')).toBe(true);
    expect(second?.startsWith('✕')).toBe(true);
    expect(third?.startsWith('·')).toBe(true);
  });
});
