/**
 * Which terminals the map wants mounted, and how that joins what Sessions
 * already mounts.
 *
 * ADR-0014 keeps one terminal per session and never mounts a session twice.
 * ADR-0064 accepted that, for three releases, the map and Sessions both
 * mount terminals; this is the join, and the reason it is a pure function is
 * that a session mounted twice is exactly the defect ADR-0014 exists for and
 * nothing on screen shows it until the core refuses a second shell (#94).
 *
 * Only an SSH component asks for a terminal. SFTP and Monitor share the
 * host's connection without a shell (ADR-0053).
 */

import type { Component, SessionHandle } from '../../ipc';
import type { MountedTerminal } from '../terminal/mounted';

/**
 * The SSH components whose host has a live connection, as terminals to mount.
 *
 * `handles` maps a session id to its handle, or to nothing when the host is
 * not connected; a component without a handle has nothing to attach to and is
 * left out, the same rule `mountedTerminals` applies to a connecting tab.
 */
export function mapTerminals(
  components: readonly Component[],
  handles: ReadonlyMap<string, SessionHandle>,
): readonly MountedTerminal[] {
  const mounted: MountedTerminal[] = [];
  for (const component of components) {
    if (component.kind !== 'ssh') continue;
    const handle = handles.get(component.host);
    if (handle === undefined) continue;
    mounted.push({ sessionId: component.host, handle });
  }
  return mounted;
}

/**
 * Everything to mount, each session once.
 *
 * Sessions' own list comes first so a session both a tab and a component
 * keeps the mount it already had, and the map only adds hosts Sessions is
 * not showing. Order is what `App.tsx` iterates in, and a stable order is
 * what keeps React from remounting a terminal that merely moved in the list.
 */
export function mountedOnce(
  fromSessions: readonly MountedTerminal[],
  fromMap: readonly MountedTerminal[],
): readonly MountedTerminal[] {
  const seen = new Set<string>();
  const out: MountedTerminal[] = [];
  for (const terminal of [...fromSessions, ...fromMap]) {
    if (seen.has(terminal.sessionId)) continue;
    seen.add(terminal.sessionId);
    out.push(terminal);
  }
  return out;
}
