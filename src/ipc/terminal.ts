/**
 * Typed wrapper over the terminal commands and events.
 *
 * Output crosses as base64, not as text. Terminal output is not guaranteed to
 * be valid UTF-8, and even when it is, a multi-byte character can land across a
 * batch boundary — decoding each batch as a string would corrupt exactly the
 * characters Portuguese and Spanish users type. `xterm.js` takes bytes and
 * holds an incomplete sequence until the rest arrives.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

import type { SessionHandle } from './sessions';

export const OUTPUT_EVENT = 'terminal://output';
export const CLOSED_EVENT = 'terminal://closed';

interface OutputEvent {
  readonly handle: SessionHandle;
  readonly data: string;
}

interface ClosedEvent {
  readonly handle: SessionHandle;
  readonly exitStatus: number | null;
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Starts a shell and begins streaming its output. */
export async function openTerminal(
  handle: SessionHandle,
  columns: number,
  rows: number,
): Promise<void> {
  return invoke<void>('open_terminal', { handle, columns, rows });
}

/**
 * The most one `send_input` call carries.
 *
 * `MAX_INPUT_BYTES` in `commands/terminal.rs`, which refuses anything larger so
 * a paste cannot be used to make the core allocate without bound. The two have
 * to agree: too high here and a large paste is refused instead of delivered.
 */
const MAX_INPUT_BYTES = 32 * 1024;

/**
 * The write in flight for each session, so the next one can wait for it.
 *
 * Keyed by handle and not global: a slow host must not hold up the keystrokes
 * going to a different one, which is the whole point of typing into several
 * sessions at once.
 */
const inFlight = new Map<SessionHandle, Promise<void>>();

/** One write, split to fit what the core accepts. */
async function deliver(handle: SessionHandle, bytes: Uint8Array): Promise<void> {
  for (let at = 0; at < bytes.length; at += MAX_INPUT_BYTES) {
    const piece = bytes.subarray(at, at + MAX_INPUT_BYTES);
    await invoke<void>('send_input', { handle, data: encode(piece) });
  }

  /* An empty write still crosses. Something the host is waiting on may be
     nothing at all, and swallowing it here would be a silent change. */
  if (bytes.length === 0) {
    await invoke<void>('send_input', { handle, data: '' });
  }
}

/**
 * Sends what the user typed. Bytes, because a paste can contain any of them.
 *
 * Split, because a paste is input too and a pasted private key runs past the
 * limit the core enforces. The pieces go one at a time and in order: the host
 * is reading a byte stream, and two calls in flight could deliver a paste
 * shuffled.
 *
 * Queued per handle for the same reason one call is split in order. Splitting
 * alone only orders the pieces of a single write; a second write starting while
 * the first is still going would interleave with it, and a keystroke landing in
 * the middle of a pasted key is not something the host can be asked to sort
 * out. Typing into several sessions at once makes overlapping writes ordinary
 * rather than rare, so the ordering is stated here instead of being inherited
 * from how fast the calls happened to be made.
 */
export function sendInput(handle: SessionHandle, bytes: Uint8Array): Promise<void> {
  const sent = (inFlight.get(handle) ?? Promise.resolve()).then(() =>
    deliver(handle, bytes),
  );

  /* What the next write waits on never carries a rejection. A refused write is
     the caller's to see, through the promise returned below; leaving it in the
     chain would make one refusal reject every keystroke after it. */
  const settled = sent.then(
    () => {},
    () => {},
  );

  inFlight.set(handle, settled);
  void settled.then(() => {
    /* Only the last write clears the slot, so a session that goes quiet stops
       costing an entry while one that is busy keeps its order. */
    if (inFlight.get(handle) === settled) inFlight.delete(handle);
  });

  return sent;
}

export async function resizeTerminal(
  handle: SessionHandle,
  columns: number,
  rows: number,
): Promise<void> {
  return invoke<void>('resize_terminal', { handle, columns, rows });
}

type OutputHandler = (bytes: Uint8Array) => void;
type ClosedHandler = (exitStatus: number | null) => void;

const outputWatchers = new Map<SessionHandle, OutputHandler>();
const closedWatchers = new Map<SessionHandle, ClosedHandler>();

/**
 * A `CLOSED_EVENT` that arrived for a handle nobody was watching yet.
 *
 * `open_terminal`'s spawned pump (`ssh/terminal.rs`) calls `sink.closed()` the
 * instant its channel reports EOF or Close, with no minimum delay: unlike
 * output, which waits for the first rate-limit tick, a shell that closes
 * right after opening can have this fire before a caller here has even
 * finished registering. One entry per handle is enough: a session closes
 * exactly once.
 */
const unclaimedClosed = new Map<SessionHandle, number | null>();

/**
 * Subscribed once, unfiltered, the first time anything here needs it, kept
 * for as long as this window runs.
 *
 * A per-handle filtered subscription used to live here instead, set up only
 * after `openTerminal` had already returned, which is to say only after the
 * shell was already open and its output pump already spawned and running.
 * Tauri does not queue an event for a listener that was not registered yet:
 * a shell that produces output, or closes, before that later subscription's
 * own round trip finishes has that event gone, not queued. Lazy rather than
 * fired at module load: this file loads in plenty of contexts, tests among
 * them, that never open a terminal and have no Tauri event bridge to answer
 * a `listen()` call at all. What matters is that `watchTerminal` below
 * awaits this before doing anything else, and is itself awaited before
 * `openTerminal` (see `use-terminal.ts`), so it is always live before the
 * shell that could race it exists.
 */
let subscribed: Promise<void> | null = null;

function ensureSubscribed(): Promise<void> {
  subscribed ??= (async () => {
    await listen<OutputEvent>(OUTPUT_EVENT, (event) => {
      outputWatchers.get(event.payload.handle)?.(decode(event.payload.data));
    });
    await listen<ClosedEvent>(CLOSED_EVENT, (event) => {
      const { handle, exitStatus } = event.payload;
      const watcher = closedWatchers.get(handle);
      if (watcher) {
        watcher(exitStatus);
      } else {
        unclaimedClosed.set(handle, exitStatus);
      }
    });
  })();
  return subscribed;
}

/**
 * Watches one session's output and closing, from before it is opened.
 *
 * Registers before the caller opens the shell, and checks
 * {@link unclaimedClosed} first: between them, a `CLOSED_EVENT` for this
 * handle cannot be lost, whichever of the two races it against.
 */
export async function watchTerminal(
  handle: SessionHandle,
  onBatch: OutputHandler,
  onClose: ClosedHandler,
): Promise<UnlistenFn> {
  await ensureSubscribed();

  outputWatchers.set(handle, onBatch);

  if (unclaimedClosed.has(handle)) {
    const exitStatus = unclaimedClosed.get(handle) ?? null;
    unclaimedClosed.delete(handle);
    onClose(exitStatus);
  } else {
    closedWatchers.set(handle, onClose);
  }

  return () => {
    outputWatchers.delete(handle);
    closedWatchers.delete(handle);
    unclaimedClosed.delete(handle);
  };
}

/** How much has moved, and how long the host takes to answer. */
export interface SessionStats {
  readonly fromHost: number;
  readonly toHost: number;
  /** The round trip in milliseconds, or `null` when the host did not answer. */
  readonly latencyMs: number | null;
}

/**
 * Measures the round trip and reads the byte counters.
 *
 * One call rather than two: the round trip is the slow part, and the counters
 * are free once the session has been looked up.
 */
export async function sessionStats(handle: SessionHandle): Promise<SessionStats> {
  return invoke<SessionStats>('session_stats', { handle });
}
