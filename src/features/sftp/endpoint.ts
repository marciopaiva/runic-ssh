/**
 * Which machine one side of a transfer is on (ADR-0045).
 *
 * Replaces the hardcoded "local pane, remote pane" pair #127 shipped with:
 * the source and every destination slot are each one of these, so
 * remote-to-remote is not a special case, it is two `'remote'` endpoints
 * instead of one `'local'` and one `'remote'`.
 */

import type { LocalEntry, SessionHandle, SftpEntry } from '../../ipc';

export type Endpoint =
  | { readonly kind: 'local' }
  | { readonly kind: 'remote'; readonly sessionId: string; readonly handle: SessionHandle };

/** Stable across renders for the same endpoint, used as a React `key` so a
 * pane remounts (and so resets its own listing state) when the endpoint it
 * shows changes, rather than needing to detect that itself. */
export function endpointKey(endpoint: Endpoint): string {
  return endpoint.kind === 'local' ? 'local' : `remote:${endpoint.sessionId}`;
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'local' || (b.kind === 'remote' && a.sessionId === b.sessionId);
}

/**
 * What the sidebar is dragging, before a connection resolves it into an
 * `Endpoint`. `localhost` needs no connection and is already the real
 * thing; a saved host is named by its session id alone until `App.tsx`'s
 * drop handler connects it (or finds it already connected) and turns it
 * into one.
 */
export type DraggedEndpoint = { readonly kind: 'local' } | { readonly kind: 'host'; readonly sessionId: string };

/** One directory entry, whichever endpoint kind it came from. The row
 * components that draw a pane's listing read only this, never `SftpEntry`
 * or `LocalEntry` directly, so they don't need to know which kind of
 * endpoint they're drawing. */
export interface PaneEntry {
  readonly name: string;
  readonly path: string;
  readonly isDir: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  readonly modifiedUnixSecs: number | null;
}

export function fromLocalEntry(entry: LocalEntry): PaneEntry {
  return { ...entry };
}

export function fromRemoteEntry(entry: SftpEntry): PaneEntry {
  return {
    name: entry.name,
    path: entry.remotePath,
    isDir: entry.isDir,
    isSymlink: entry.isSymlink,
    size: entry.size,
    modifiedUnixSecs: entry.modifiedUnixSecs,
  };
}
