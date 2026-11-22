/**
 * Where a session's shell says it is (OSC 7).
 *
 * A shell that wants a terminal to know its working directory prints
 * `ESC ] 7 ; file://host/path BEL` at each prompt. Nothing here asks the host
 * for anything: it only reads what the shell chose to print, which is why the
 * SFTP pane can offer "the terminal's folder" without a new command in the
 * core.
 *
 * The value is host-supplied text (adversary 1 in `docs/security-model.md`).
 * It is used for one thing, listing a directory on the same connection the
 * text came from, which that host controls anyway. Even so it is shaped before
 * it is kept: bounded, no control characters, and an absolute path or nothing.
 * The host part of the URL is ignored, since a shell can write any name there.
 */

import { useSyncExternalStore } from 'react';

import type { SessionHandle } from '../../ipc';

/** Longer than any real path (`PATH_MAX` is 4096 on Linux). */
const MAX_PATH_CHARS = 4096;

/**
 * The directory an OSC 7 payload names, or `null` when it names none that is
 * safe to use.
 */
export function parseOsc7(data: string): string | null {
  if (!data.startsWith('file://')) return null;

  const rest = data.slice('file://'.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;

  /* A path never carries a query or fragment: a `#` or `?` that belongs to a
     name arrives percent-encoded. */
  const raw = rest.slice(slash).split(/[?#]/, 1)[0] ?? '';

  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    /* A shell that printed a literal `%` without encoding it: take the text as
       it came, which is what the shell meant. */
  }

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.length === 0 || path.length > MAX_PATH_CHARS) return null;

  /* `file:///C:/Users/me`, from a Windows shell on this machine. */
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);

  return path;
}

/* One value per connection, kept outside React so a terminal can report
   without the SFTP panes being its ancestors or its children. */
const cwds = new Map<SessionHandle, string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Records where `handle`'s shell is now. */
export function reportTerminalCwd(handle: SessionHandle, path: string): void {
  if (cwds.get(handle) === path) return;
  cwds.set(handle, path);
  emit();
}

/** Drops what was known about `handle`, when its terminal goes away. */
export function forgetTerminalCwd(handle: SessionHandle): void {
  if (cwds.delete(handle)) emit();
}

/** The same answer without a hook, for what is not a component. */
export function getTerminalCwd(handle: SessionHandle): string | null {
  return cwds.get(handle) ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last folder `handle`'s shell reported, or `null` if it never has. */
export function useTerminalCwd(handle: SessionHandle | null): string | null {
  return useSyncExternalStore(subscribe, () => (handle === null ? null : getTerminalCwd(handle)));
}
