/**
 * Typed wrapper over the local shell commands and events.
 *
 * Mirrors `ipc/terminal.ts`'s wire shapes (base64 output, `{ ..., exitStatus }`
 * on close) because both cross through the same `ssh::terminal::{Sink,
 * OutputBatch}` framing on the Rust side. What differs is the id: a
 * `SessionHandle` names a saved session that exists before its shell opens,
 * while a local shell's `SessionId` is minted by `open_local_shell` itself, so
 * there is nothing to subscribe against until that call returns. See the
 * queueing in {@link watchLocalShell} below.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export const OUTPUT_EVENT = 'local-shell://output';
export const CLOSED_EVENT = 'local-shell://closed';

/**
 * A kind of local shell this platform can open. Opaque beyond its `kind` tag
 * and, for `wsl`, the distro name: no display label crosses the IPC
 * boundary, since CLAUDE.md section 1 keeps user-facing text out of every
 * file but `src/locales/`. The frontend maps each variant to its own locale
 * key.
 */
export type LocalShellKind =
  | { readonly kind: 'powerShell' }
  | { readonly kind: 'cmd' }
  | { readonly kind: 'wsl'; readonly distro: string }
  | { readonly kind: 'defaultShell' };

/**
 * An opaque reference to an open local shell. A number with no meaning
 * outside the core, minted by {@link openLocalShell}: this is not the
 * client-minted `sessionId` a `Focus` of kind `'local'` carries, which
 * identifies the tab and exists before the shell behind it does.
 */
export type SessionId = number;

interface OutputEvent {
  readonly id: SessionId;
  readonly data: string;
}

interface ClosedEvent {
  readonly id: SessionId;
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

/** The shells this platform offers, detected once by the core and cached there. */
export async function listLocalShellKinds(): Promise<LocalShellKind[]> {
  return invoke<LocalShellKind[]>('list_local_shell_kinds');
}

/** Opens a native pty running `kind` and begins streaming its output. */
export async function openLocalShell(
  kind: LocalShellKind,
  columns: number,
  rows: number,
): Promise<SessionId> {
  return invoke<SessionId>('open_local_shell', { kind, columns, rows });
}

/**
 * The most one `write_local_shell` call carries.
 *
 * `MAX_INPUT_BYTES` in `commands/terminal.rs`, which `write_local_shell`
 * reuses via `check_input_size`. The two have to agree: too high here and a
 * large paste is refused instead of delivered.
 */
const MAX_INPUT_BYTES = 32 * 1024;

/** The write in flight for each shell, so the next one can wait for it. */
const inFlight = new Map<SessionId, Promise<void>>();

/** One write, split to fit what the core accepts. */
async function deliver(id: SessionId, bytes: Uint8Array): Promise<void> {
  for (let at = 0; at < bytes.length; at += MAX_INPUT_BYTES) {
    const piece = bytes.subarray(at, at + MAX_INPUT_BYTES);
    await invoke<void>('write_local_shell', { id, data: encode(piece) });
  }

  if (bytes.length === 0) {
    await invoke<void>('write_local_shell', { id, data: '' });
  }
}

/**
 * Sends what the user typed. Bytes, split and queued in order, for exactly
 * the reasons `ipc/terminal.ts`'s `sendInput` gives: a paste can contain any
 * byte and can run past the core's own limit, and two writes in flight could
 * otherwise interleave.
 */
export function writeLocalShell(id: SessionId, bytes: Uint8Array): Promise<void> {
  const sent = (inFlight.get(id) ?? Promise.resolve()).then(() => deliver(id, bytes));

  const settled = sent.then(
    () => {},
    () => {},
  );

  inFlight.set(id, settled);
  void settled.then(() => {
    if (inFlight.get(id) === settled) inFlight.delete(id);
  });

  return sent;
}

/** Tells the pty the window changed size. */
export async function resizeLocalShell(id: SessionId, columns: number, rows: number): Promise<void> {
  return invoke<void>('resize_local_shell', { id, columns, rows });
}

/** Kills the shell's child process and forgets it. */
export async function closeLocalShell(id: SessionId): Promise<void> {
  return invoke<void>('close_local_shell', { id });
}

type OutputHandler = (bytes: Uint8Array) => void;
type ClosedHandler = (exitStatus: number | null) => void;

const outputWatchers = new Map<SessionId, OutputHandler>();
const closedWatchers = new Map<SessionId, ClosedHandler>();

/**
 * Output and closing that arrived for an id nobody was watching yet.
 *
 * Unlike `ipc/terminal.ts`, where a handle exists (and can be watched)
 * before its shell opens, a local shell's id is handed back only when
 * `openLocalShell` resolves. Its pump task is spawned before that IPC call
 * returns, so a fast-printing shell can have output, or even a close, land
 * at the global listener below before `watchLocalShell` has registered for
 * it. Both are queued here, in order, and flushed to the caller as soon as
 * it starts watching.
 */
const unclaimed = new Map<SessionId, { chunks: Uint8Array[]; closed?: number | null }>();

function unclaimedFor(id: SessionId): { chunks: Uint8Array[]; closed?: number | null } {
  let entry = unclaimed.get(id);
  if (!entry) {
    entry = { chunks: [] };
    unclaimed.set(id, entry);
  }
  return entry;
}

/**
 * Subscribed once, unfiltered, the first time anything here needs it. See
 * `ipc/terminal.ts`'s `ensureSubscribed`, which this copies: Tauri does not
 * queue an event for a listener registered after it fired, and this file
 * loads in contexts (tests among them) with no Tauri event bridge to answer
 * a `listen()` call at all.
 */
let subscribed: Promise<void> | null = null;

function ensureSubscribed(): Promise<void> {
  subscribed ??= (async () => {
    await listen<OutputEvent>(OUTPUT_EVENT, (event) => {
      const { id, data } = event.payload;
      const watcher = outputWatchers.get(id);
      if (watcher) {
        watcher(decode(data));
      } else {
        unclaimedFor(id).chunks.push(decode(data));
      }
    });
    await listen<ClosedEvent>(CLOSED_EVENT, (event) => {
      const { id, exitStatus } = event.payload;
      const watcher = closedWatchers.get(id);
      if (watcher) {
        watcher(exitStatus);
      } else {
        unclaimedFor(id).closed = exitStatus;
      }
    });
  })();
  return subscribed;
}

/**
 * Watches one shell's output and closing, from as soon as its id is known.
 *
 * Flushes whatever arrived before this call in the order it arrived, then
 * delivers live. Call this right after {@link openLocalShell} resolves, with
 * nothing awaited in between: that is what keeps the queue in
 * {@link unclaimed} short rather than unbounded.
 */
export async function watchLocalShell(
  id: SessionId,
  onBatch: OutputHandler,
  onClose: ClosedHandler,
): Promise<UnlistenFn> {
  await ensureSubscribed();

  outputWatchers.set(id, onBatch);

  const pending = unclaimed.get(id);
  unclaimed.delete(id);

  for (const chunk of pending?.chunks ?? []) {
    onBatch(chunk);
  }

  if (pending && 'closed' in pending) {
    onClose(pending.closed ?? null);
  } else {
    closedWatchers.set(id, onClose);
  }

  return () => {
    outputWatchers.delete(id);
    closedWatchers.delete(id);
    unclaimed.delete(id);
  };
}
