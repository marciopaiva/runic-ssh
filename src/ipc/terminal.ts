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

/**
 * Which of a connection's (at most two) shells this is about. ADR-0077.
 *
 * A connection's first shell is always `'primary'`; `'secondary'` is the one
 * "duplicate this shell" opens, multiplexed over the same transport. There is
 * no third value, by construction of `ShellSlot` in `ssh/registry.rs`.
 */
export type ShellSlot = 'primary' | 'secondary';

interface OutputEvent {
  readonly handle: SessionHandle;
  readonly slot: ShellSlot;
  readonly data: string;
}

interface ClosedEvent {
  readonly handle: SessionHandle;
  readonly slot: ShellSlot;
  readonly exitStatus: number | null;
}

/** Keys the per-slot maps below, since a shell is addressed by both. */
function slotKey(handle: SessionHandle, slot: ShellSlot): string {
  return `${handle}:${slot}`;
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

/**
 * Starts a shell and begins streaming its output.
 *
 * `slot` defaults to the primary, which is every caller from before
 * ADR-0077. A secondary shell is opened through `duplicate_shell` rather
 * than `open_terminal` on the Rust side, since it has its own guard (the
 * primary must already exist, and there must not be a secondary yet) instead
 * of `open_terminal`'s.
 */
export async function openTerminal(
  handle: SessionHandle,
  columns: number,
  rows: number,
  slot: ShellSlot = 'primary',
): Promise<void> {
  if (slot === 'secondary') {
    return invoke<void>('duplicate_shell', { handle, columns, rows });
  }
  return invoke<void>('open_terminal', { handle, columns, rows });
}

/** Closes one shell. Never the primary: closing that is disconnecting. */
export async function closeShell(handle: SessionHandle, slot: ShellSlot): Promise<void> {
  return invoke<void>('close_shell', { handle, slot });
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
 * The write in flight for each session's shell, so the next one can wait for
 * it.
 *
 * Keyed by handle and slot together and not globally: a slow host must not
 * hold up the keystrokes going to a different session, or to the other shell
 * of the same one, which is the whole point of typing into several sessions,
 * or several shells, at once.
 */
const inFlight = new Map<string, Promise<void>>();

/** One write, split to fit what the core accepts. */
async function deliver(handle: SessionHandle, slot: ShellSlot, bytes: Uint8Array): Promise<void> {
  for (let at = 0; at < bytes.length; at += MAX_INPUT_BYTES) {
    const piece = bytes.subarray(at, at + MAX_INPUT_BYTES);
    await invoke<void>('send_input', { handle, data: encode(piece), slot });
  }

  /* An empty write still crosses. Something the host is waiting on may be
     nothing at all, and swallowing it here would be a silent change. */
  if (bytes.length === 0) {
    await invoke<void>('send_input', { handle, data: '', slot });
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
 * Queued per handle and slot for the same reason one call is split in order.
 * Splitting alone only orders the pieces of a single write; a second write
 * starting while the first is still going would interleave with it, and a
 * keystroke landing in the middle of a pasted key is not something the host
 * can be asked to sort out. Typing into several sessions at once, or into a
 * session's two shells at once, makes overlapping writes ordinary rather than
 * rare, so the ordering is stated here instead of being inherited from how
 * fast the calls happened to be made.
 *
 * `slot` defaults to the primary, which is every caller from before
 * ADR-0077.
 */
export function sendInput(
  handle: SessionHandle,
  bytes: Uint8Array,
  slot: ShellSlot = 'primary',
): Promise<void> {
  const key = slotKey(handle, slot);
  const sent = (inFlight.get(key) ?? Promise.resolve()).then(() =>
    deliver(handle, slot, bytes),
  );

  /* What the next write waits on never carries a rejection. A refused write is
     the caller's to see, through the promise returned below; leaving it in the
     chain would make one refusal reject every keystroke after it. */
  const settled = sent.then(
    () => {},
    () => {},
  );

  inFlight.set(key, settled);
  void settled.then(() => {
    /* Only the last write clears the slot, so a shell that goes quiet stops
       costing an entry while one that is busy keeps its order. */
    if (inFlight.get(key) === settled) inFlight.delete(key);
  });

  return sent;
}

export async function resizeTerminal(
  handle: SessionHandle,
  columns: number,
  rows: number,
  slot: ShellSlot = 'primary',
): Promise<void> {
  return invoke<void>('resize_terminal', { handle, columns, rows, slot });
}

type OutputHandler = (bytes: Uint8Array) => void;
type ClosedHandler = (exitStatus: number | null) => void;

const outputWatchers = new Map<string, OutputHandler>();
const closedWatchers = new Map<string, ClosedHandler>();

/**
 * A `CLOSED_EVENT` that arrived for a handle and slot nobody was watching yet.
 *
 * `open_terminal`'s spawned pump (`ssh/terminal.rs`) calls `sink.closed()` the
 * instant its channel reports EOF or Close, with no minimum delay: unlike
 * output, which waits for the first rate-limit tick, a shell that closes
 * right after opening can have this fire before a caller here has even
 * finished registering. One entry per handle and slot is enough: a shell
 * closes exactly once.
 */
const unclaimedClosed = new Map<string, number | null>();

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
      const key = slotKey(event.payload.handle, event.payload.slot);
      outputWatchers.get(key)?.(decode(event.payload.data));
    });
    await listen<ClosedEvent>(CLOSED_EVENT, (event) => {
      const { handle, slot, exitStatus } = event.payload;
      const key = slotKey(handle, slot);
      const watcher = closedWatchers.get(key);
      if (watcher) {
        watcher(exitStatus);
      } else {
        unclaimedClosed.set(key, exitStatus);
      }
    });
  })();
  return subscribed;
}

/**
 * Watches one shell's output and closing, from before it is opened.
 *
 * Registers before the caller opens the shell, and checks
 * {@link unclaimedClosed} first: between them, a `CLOSED_EVENT` for this
 * handle and slot cannot be lost, whichever of the two races it against.
 *
 * `slot` defaults to the primary, which is every caller from before
 * ADR-0077.
 */
export async function watchTerminal(
  handle: SessionHandle,
  onBatch: OutputHandler,
  onClose: ClosedHandler,
  slot: ShellSlot = 'primary',
): Promise<UnlistenFn> {
  await ensureSubscribed();

  const key = slotKey(handle, slot);

  outputWatchers.set(key, onBatch);

  if (unclaimedClosed.has(key)) {
    const exitStatus = unclaimedClosed.get(key) ?? null;
    unclaimedClosed.delete(key);
    onClose(exitStatus);
  } else {
    closedWatchers.set(key, onClose);
  }

  return () => {
    outputWatchers.delete(key);
    closedWatchers.delete(key);
    unclaimedClosed.delete(key);
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

/** How much of something is in use, in kibibytes. */
export interface Usage {
  readonly usedKb: number;
  readonly totalKb: number;
}

/**
 * The scheduler load averages Linux keeps, over one, five and fifteen
 * minutes. Unbounded, unlike every other reading here: a host with sixteen
 * cores comfortably runs at a load of 12.
 */
export interface LoadAverage {
  readonly one: number;
  readonly five: number;
  readonly fifteen: number;
}

/** One mounted filesystem, pseudo-filesystems already filtered out. See `ssh/monitor.rs`. */
export interface Filesystem {
  readonly mount: string;
  readonly usage: Usage;
}

/**
 * How fast bytes are moving over every network interface but loopback,
 * summed rather than kept per interface.
 */
export interface NetworkRate {
  readonly receiveBytesPerSec: number;
  readonly transmitBytesPerSec: number;
}

/**
 * How fast bytes are moving across every real disk, summed rather than kept
 * per device: the same "busier than usual" question `NetworkRate` already
 * answers for the network. A partition's own I/O is folded into its parent
 * disk's counters already, so `ssh/monitor.rs` excludes it from this sum
 * rather than counting it twice.
 */
export interface DiskIoRate {
  readonly readBytesPerSec: number;
  readonly writeBytesPerSec: number;
}

/**
 * A host's own vital signs, read over the connection already open.
 *
 * Every field is independent and `null` (or, for `filesystems`, empty) on
 * its own when it could not be read. A host that is not Linux, or one whose
 * `df`/`free`/`uptime` output did not parse, still reports whichever of
 * these this did understand. See `ssh/monitor.rs`.
 */
export interface SystemStats {
  readonly cpuPercent: number | null;
  readonly memory: Usage | null;
  readonly swap: Usage | null;
  readonly disk: Usage | null;
  readonly filesystems: readonly Filesystem[];
  readonly network: NetworkRate | null;
  readonly diskIo: DiskIoRate | null;
  readonly uptimeSeconds: number | null;
  readonly loadAverage: LoadAverage | null;
}

/** Runs the monitor command over `handle`'s connection and parses it. */
export async function sessionMonitor(handle: SessionHandle): Promise<SystemStats> {
  return invoke<SystemStats>('session_monitor', { handle });
}
