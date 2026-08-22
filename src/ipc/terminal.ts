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

/** Sends what the user typed. Bytes, because a paste can contain any of them. */
export async function sendInput(
  handle: SessionHandle,
  bytes: Uint8Array,
): Promise<void> {
  return invoke<void>('send_input', { handle, data: encode(bytes) });
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
