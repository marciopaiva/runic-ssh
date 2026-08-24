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

/**
 * Subscribes to output for one session.
 *
 * The handle filter is applied here rather than by the core, because Tauri
 * events are broadcast to every listener: a second terminal must not receive
 * the first one's output just because it was listening.
 */
export async function onOutput(
  handle: SessionHandle,
  onBatch: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<OutputEvent>(OUTPUT_EVENT, (event) => {
    if (event.payload.handle !== handle) return;
    onBatch(decode(event.payload.data));
  });
}

export async function onClosed(
  handle: SessionHandle,
  onClose: (exitStatus: number | null) => void,
): Promise<UnlistenFn> {
  return listen<ClosedEvent>(CLOSED_EVENT, (event) => {
    if (event.payload.handle !== handle) return;
    onClose(event.payload.exitStatus);
  });
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
