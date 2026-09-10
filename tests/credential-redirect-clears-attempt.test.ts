// @vitest-environment jsdom

/**
 * Guards #358: an ordinary connect that finds nothing usable saved is
 * redirected to the host's own editor (ADR-0039), and the attempt that
 * asked must be over by then. Left at `connecting`, it drew a 'Reaching…'
 * card over the editor it had just opened, with Save reading 'Proving' and
 * every field disabled, until the card's own Cancel was found. Seen from
 * the map first, then from a Sessions click on a host with nothing stored.
 *
 * Drives the hook through a mocked `../src/ipc`, the same pattern
 * `inline-listener-timeout.test.ts` uses.
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ipc = vi.hoisted(() => ({
  /* The real narrowing, in miniature: a rejection with a string code is ours. */
  asIpcError: vi.fn((rejection: unknown) =>
    typeof rejection === 'object' &&
    rejection !== null &&
    typeof (rejection as { code?: unknown }).code === 'string'
      ? rejection
      : undefined,
  ),
  authenticateSession: vi.fn(async () => {}),
  authenticateWithSaved: vi.fn(async () => {}),
  connectSession: vi.fn(async () => ({
    handle: 1,
    sessionId: 's1',
    name: 's1',
    authenticated: false,
  })),
  credentialPrompt: vi.fn(async () => ({})),
  disconnectSession: vi.fn(async () => {}),
  dismissCredential: vi.fn(async () => {}),
  dismissHostKey: vi.fn(async () => {}),
  hostKeyDecision: vi.fn(async () => ({})),
  keepCredentialForRun: vi.fn(async () => {}),
  onInlineCredentialRequest: vi.fn(async () => () => {}),
  rememberCredential: vi.fn(async () => {}),
  trustHostKey: vi.fn(async () => {}),
}));

vi.mock('../src/ipc', () => ipc);

const { useConnect } = await import('../src/features/sessions/use-connect');
type ConnectState = ReturnType<typeof useConnect>;

const wiring = {
  onCredentialMissing: vi.fn(),
  onFailed: vi.fn(),
  onOpened: vi.fn(),
};

function Probe(props: { onState: (state: ConnectState) => void }): null {
  const state = useConnect({
    onOpened: (sessionId, handle, via) =>
      wiring.onOpened(sessionId, handle, via),
    onConnecting: () => {},
    onFailed: (sessionId, code) => wiring.onFailed(sessionId, code),
    onAbandoned: () => {},
    onCredentialRefused: () => {},
    onCredentialSettled: () => {},
    onCredentialMissing: (sessionId, hop) =>
      wiring.onCredentialMissing(sessionId, hop),
  });
  props.onState(state);
  return null;
}

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
  for (const fn of Object.values(wiring)) fn.mockClear();
  ipc.connectSession.mockReset();
  ipc.authenticateWithSaved.mockReset();
  ipc.disconnectSession.mockClear();
});

describe('a connect redirected for a missing credential', () => {
  it('is over once the target has nothing saved: no attempt is left connecting', async () => {
    ipc.connectSession.mockResolvedValue({
      handle: 1,
      sessionId: 's1',
      name: 's1',
      authenticated: false,
    });
    ipc.authenticateWithSaved.mockRejectedValue({ code: 'noSavedCredential' });
    const probe = await mountProbe();

    await act(async () => {
      await probe.state().connect('s1');
    });

    expect(wiring.onCredentialMissing).toHaveBeenCalledWith('s1', 'target');
    expect(wiring.onFailed).not.toHaveBeenCalled();
    expect(wiring.onOpened).not.toHaveBeenCalled();
    /* The connection it opened is closed, and the editor is where this
       continues: nothing is in progress any more. */
    expect(ipc.disconnectSession).toHaveBeenCalledWith(1);
    expect(probe.state().attempt).toBeNull();

    await probe.unmount();
  });

  it('is over once the bastion has nothing saved, the same way', async () => {
    ipc.connectSession.mockRejectedValue({
      code: 'chainFailed',
      hop: 'bastion',
      inner: { code: 'noSavedCredential' },
    });
    const probe = await mountProbe();

    await act(async () => {
      await probe.state().connect('s1');
    });

    expect(wiring.onCredentialMissing).toHaveBeenCalledWith('s1', 'bastion');
    expect(wiring.onFailed).not.toHaveBeenCalled();
    expect(probe.state().attempt).toBeNull();

    await probe.unmount();
  });

  it('still fails an ordinary refusal instead of redirecting', async () => {
    ipc.connectSession.mockResolvedValue({
      handle: 1,
      sessionId: 's1',
      name: 's1',
      authenticated: false,
    });
    ipc.authenticateWithSaved.mockRejectedValue({ code: 'sshTransport' });
    const probe = await mountProbe();

    await act(async () => {
      await probe.state().connect('s1');
    });

    expect(wiring.onCredentialMissing).not.toHaveBeenCalled();
    expect(wiring.onFailed).toHaveBeenCalledWith('s1', 'sshTransport');
    expect(probe.state().attempt?.stage.stage).toBe('failed');

    await probe.unmount();
  });
});
