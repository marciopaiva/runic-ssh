/**
 * Guards the race `watchTerminal` exists to close.
 *
 * `ssh/terminal.rs`'s spawned pump calls `sink.closed()` the instant its
 * channel reports EOF or Close, with no minimum delay: a shell that closes
 * right after opening can have `CLOSED_EVENT` fire before a caller here has
 * finished registering for it. A per-handle filtered subscription used to
 * live in `src/ipc/terminal.ts` instead, set up only after `openTerminal` had
 * already returned; Tauri does not queue an event for a listener that was not
 * registered yet, so that subscription's own round trip could lose the event
 * outright and leave `useTerminal`'s `exitStatus` stuck at `null` forever.
 * `sftp.ts`'s `onAnyFinished`/`unclaimedFinished` guard the same shape of
 * race for transfer completion; this is that fix applied here, with the
 * subscription made lazily rather than at module load, since this file
 * loads in test contexts with no Tauri event bridge to answer it.
 */

import { describe, expect, it, vi } from 'vitest';

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (): Promise<void> => {},
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (
    event: string,
    callback: (event: { payload: unknown }) => void,
  ): Promise<() => void> => {
    listeners.set(event, callback);
    return () => {};
  },
}));

const { CLOSED_EVENT, OUTPUT_EVENT, watchTerminal } = await import('../src/ipc/terminal');

function emitOutput(handle: number, text: string): void {
  listeners.get(OUTPUT_EVENT)?.({ payload: { handle, data: btoa(text) } });
}

function emitClosed(handle: number, exitStatus: number | null): void {
  listeners.get(CLOSED_EVENT)?.({ payload: { handle, exitStatus } });
}

function decoded(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf8');
}

let nextHandle = 1;
/** A handle nothing this file has used yet, so tests never share the
    module-level watcher maps. */
function freshHandle(): number {
  const handle = nextHandle;
  nextHandle += 1;
  return handle;
}

describe('the closed event nobody was listening for yet', () => {
  /* The shared subscription is lazy (see `watchTerminal`'s own doc comment):
     it comes to life on the first call to `watchTerminal` anywhere, not at
     module load. A throwaway call for an unrelated handle stands in for
     "some earlier terminal already opened this session" and brings the
     subscription up, the same way a real second tab finds it already live. */
  async function withSubscriptionUp(): Promise<void> {
    await watchTerminal(freshHandle(), () => {}, () => {});
  }

  it('is still delivered once a watcher registers', async () => {
    await withSubscriptionUp();
    const handle = freshHandle();

    /* The shell closes before `watchTerminal` has been called for *this*
       handle: `outputWatchers`/`closedWatchers` have no entry for it yet,
       which is the ordering `unclaimedClosed` exists to survive. */
    emitClosed(handle, 0);

    const onClose = vi.fn();
    await watchTerminal(handle, () => {}, onClose);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it('carries the real exit status through the buffer', async () => {
    await withSubscriptionUp();
    const handle = freshHandle();

    emitClosed(handle, 127);

    const onClose = vi.fn();
    await watchTerminal(handle, () => {}, onClose);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(127);
  });

  it('does not replay a buffered close for a different handle', async () => {
    await withSubscriptionUp();
    const closed = freshHandle();
    const other = freshHandle();
    emitClosed(closed, 0);

    const onClose = vi.fn();
    await watchTerminal(other, () => {}, onClose);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the ordinary order, watcher before event', () => {
  it('delivers a close that arrives after registering', async () => {
    const handle = freshHandle();
    const onClose = vi.fn();
    await watchTerminal(handle, () => {}, onClose);

    emitClosed(handle, 1);

    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it('routes output only to the handle it belongs to', async () => {
    const first = freshHandle();
    const second = freshHandle();
    const firstBatches: string[] = [];
    const secondBatches: string[] = [];

    await watchTerminal(
      first,
      (bytes) => firstBatches.push(decoded(bytes)),
      () => {},
    );
    await watchTerminal(
      second,
      (bytes) => secondBatches.push(decoded(bytes)),
      () => {},
    );

    emitOutput(first, 'from the first shell');
    emitOutput(second, 'from the second shell');

    expect(firstBatches).toEqual(['from the first shell']);
    expect(secondBatches).toEqual(['from the second shell']);
  });
});

describe('unwatching', () => {
  it('stops delivery to a session nobody watches any more', async () => {
    const handle = freshHandle();
    const onBatch = vi.fn();
    const onClose = vi.fn();
    const stop = await watchTerminal(handle, onBatch, onClose);

    stop();
    emitOutput(handle, 'too late');
    emitClosed(handle, 0);

    expect(onBatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
