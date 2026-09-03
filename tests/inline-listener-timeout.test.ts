// @vitest-environment jsdom

/**
 * Guards #240: a chain through a bastion sat on "Reaching…" long after the
 * far host had already answered, because `onInlineCredentialRequest`
 * (registering to hear the bastion's own inline credential request, a call
 * into the webview's own event system rather than into the core) can
 * occasionally take far longer than the connect it exists to guard, and
 * nothing bounded it.
 *
 * Reproduced live against the real two-hop fixture: instrumenting every
 * `await` on the Rust side showed each one settling in under 150ms, while
 * the frontend sat well past that with `connect_session` not even entered
 * yet, confirming the stall was in this one registration, on this side of
 * the IPC boundary.
 *
 * Drives the hook through a mocked `../src/ipc`, the same pattern
 * `terminal-teardown.test.ts` already uses for `useTerminal`.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ipc = vi.hoisted(() => ({
  asIpcError: vi.fn(() => undefined),
  authenticateSession: vi.fn(async () => {}),
  authenticateWithSaved: vi.fn(async () => {}),
  connectSession: vi.fn(async () => ({ handle: 1, sessionId: 'a1', name: 'a1', authenticated: false })),
  credentialPrompt: vi.fn(async () => ({})),
  disconnectSession: vi.fn(async () => {}),
  dismissCredential: vi.fn(async () => {}),
  dismissHostKey: vi.fn(async () => {}),
  hostKeyDecision: vi.fn(async () => ({})),
  keepCredentialForRun: vi.fn(async () => {}),
  /* Never resolves on its own: this is the registration the fix has to put
     a bound around, not the thing under test. */
  onInlineCredentialRequest: vi.fn(() => new Promise<() => void>(() => {})),
  rememberCredential: vi.fn(async () => {}),
  trustHostKey: vi.fn(async () => {}),
}));

vi.mock('../src/ipc', () => ipc);

const { useConnect } = await import('../src/features/sessions/use-connect');
type ConnectState = ReturnType<typeof useConnect>;

function Probe(props: { onState: (state: ConnectState) => void }): null {
  const state = useConnect({
    onOpened: () => {},
    onConnecting: () => {},
    onFailed: (sessionId, code) => wiring.onFailed(sessionId, code),
    onAbandoned: () => {},
    onCredentialRefused: () => {},
    onCredentialSettled: () => {},
    onCredentialMissing: () => {},
  });
  props.onState(state);
  return null;
}

const wiring = { onFailed: vi.fn() };

async function mountProbe() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  let latest: ConnectState | null = null;
  await act(async () => {
    root.render(createElement(Probe, { onState: (state) => (latest = state) }));
  });

  return {
    state: (): ConnectState => {
      if (latest === null) throw new Error('useConnect never reported a state');
      return latest;
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

beforeEach(() => {
  wiring.onFailed.mockClear();
  ipc.connectSession.mockClear();
  ipc.onInlineCredentialRequest.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a bastion listener that never registers', () => {
  it('fails the attempt instead of waiting forever', async () => {
    const probe = await mountProbe();
    vi.useFakeTimers();

    let settled = false;
    const attempt = act(async () => {
      await probe.state().connect('a1', 'inline').then(() => {
        settled = true;
      });
    });

    // Nothing has resolved yet, and the connect attempt has not reached the
    // core: it is still waiting on the listener registration.
    expect(ipc.connectSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await attempt;

    expect(settled).toBe(true);
    expect(wiring.onFailed).toHaveBeenCalledWith('a1', 'bastionListenerTimedOut');
    // Never reached the core at all: the whole point is not to wait on a
    // connect that was never going to be asked for.
    expect(ipc.connectSession).not.toHaveBeenCalled();

    await probe.unmount();
  });

  it('still unregisters a listener that shows up after giving up on it', async () => {
    let resolveRegistration: (fn: () => void) => void = () => {};
    ipc.onInlineCredentialRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRegistration = resolve;
      }),
    );

    const probe = await mountProbe();
    vi.useFakeTimers();
    const attempt = act(async () => {
      await probe.state().connect('a1', 'inline');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await attempt;
    expect(wiring.onFailed).toHaveBeenCalledWith('a1', 'bastionListenerTimedOut');

    const unlisten = vi.fn();
    await act(async () => {
      resolveRegistration(unlisten);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unlisten).toHaveBeenCalled();

    await probe.unmount();
  });
});
