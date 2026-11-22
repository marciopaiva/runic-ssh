// @vitest-environment jsdom
//
// ADR-0079: the schedule, what is retried and what stops the loop, and that no
// timer outlives what asked for it.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { MAX_ATTEMPTS, backoffMs, classify } = await import('../src/features/sessions/reconnect');
const { useReconnect } = await import('../src/features/sessions/use-reconnect');

describe('the schedule', () => {
  it('doubles from one second up to a thirty second ceiling', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe('what is retried', () => {
  it('retries only a failure to reach the host', () => {
    for (const code of ['hostUnreachable', 'connectTimedOut', 'sshTransport'] as const) {
      expect(classify(code, false)).toBe('retry');
    }
  });

  it('stops for a key decision, a refused credential and a missing one', () => {
    expect(classify('sshTransport', true)).toBe('hostKey');
    expect(classify('hostKeyRevoked', false)).toBe('hostKey');
    expect(classify('authenticationFailed', false)).toBe('rejected');
    expect(classify('noSavedCredential', false)).toBe('credential');
    expect(classify('vaultLocked', false)).toBe('credential');
    expect(classify('unknownHandle', false)).toBe('other');
  });
});

type Outcome = import('../src/features/sessions/use-connect').QuietOutcome;
const quiet = {
  reconnectQuietly: vi.fn<(id: string) => Promise<Outcome>>(),
  cancelQuiet: vi.fn<(id: string) => void>(),
};
const stopped = vi.fn();
let api: ReturnType<typeof useReconnect>;

function Probe(): null {
  api = useReconnect(quiet, stopped);
  return null;
}

let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers();
  quiet.reconnectQuietly.mockReset();
  quiet.cancelQuiet.mockReset();
  stopped.mockReset();
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

const mount = async (): Promise<void> => {
  await act(async () => root.render(createElement(Probe)));
};
const fail = (code: string, held = false): Outcome =>
  ({ ok: false, cancelled: false, code, held }) as Outcome;

describe('the loop', () => {
  it('retries after the backoff until the host answers', async () => {
    quiet.reconnectQuietly
      .mockResolvedValueOnce(fail('hostUnreachable'))
      .mockResolvedValueOnce({ ok: true });
    await mount();

    await act(async () => api.begin('s1'));
    expect(api.views.get('s1')).toEqual({ phase: 'waiting', attempt: 1 });
    expect(quiet.reconnectQuietly).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(quiet.reconnectQuietly).toHaveBeenCalledTimes(1);
    expect(api.views.get('s1')).toEqual({ phase: 'waiting', attempt: 2 });

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(quiet.reconnectQuietly).toHaveBeenCalledTimes(2);
    expect(api.views.has('s1')).toBe(false);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('stops at once on a refused credential, without a second try', async () => {
    quiet.reconnectQuietly.mockResolvedValue(fail('authenticationFailed'));
    await mount();

    await act(async () => api.begin('s1'));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(quiet.reconnectQuietly).toHaveBeenCalledTimes(1);
    expect(api.views.get('s1')).toEqual({ phase: 'stopped', reason: 'rejected' });
    expect(stopped).toHaveBeenCalledWith('s1', 'rejected', 'authenticationFailed');
  });

  it('gives up after the last attempt', async () => {
    quiet.reconnectQuietly.mockResolvedValue(fail('hostUnreachable'));
    await mount();

    await act(async () => api.begin('s1'));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(quiet.reconnectQuietly).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(api.views.get('s1')).toEqual({ phase: 'stopped', reason: 'exhausted' });
  });

  it('cancel clears the timer and drops an attempt in flight', async () => {
    await mount();
    await act(async () => api.begin('s1'));

    await act(async () => api.cancel('s1'));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(quiet.reconnectQuietly).not.toHaveBeenCalled();
    expect(quiet.cancelQuiet).toHaveBeenCalledWith('s1');
    expect(api.views.has('s1')).toBe(false);
  });

  it('unmounting clears every pending timer', async () => {
    await mount();
    await act(async () => {
      api.begin('s1');
      api.begin('s2');
    });

    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(quiet.reconnectQuietly).not.toHaveBeenCalled();
    expect(quiet.cancelQuiet).toHaveBeenCalledWith('s1');
    expect(quiet.cancelQuiet).toHaveBeenCalledWith('s2');
    root = createRoot(document.createElement('div'));
  });
});
