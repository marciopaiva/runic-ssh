/**
 * Lines between components, and where a keystroke typed on the map goes.
 *
 * ADR-0065. A line joins two components of one family: terminals with
 * terminals, file browsers with file browsers. A terminal line has no
 * direction and its connected set is the map's group; the switch on the set
 * arms typing into every open window in it. A file-browser line is
 * directed, `a` the origin and `b` the destination, and carries a transfer
 * (#368).
 *
 * The rules on a terminal set are ADR-0019's, unchanged: off by default,
 * keyed by the set's members so that a changed set is a different switch,
 * a window can spare itself, a collapsed window is spared the way a tab in
 * a group's background is, and one receiving window is no broadcast at all.
 *
 * Pure, for the reason `groups.ts` is: what goes wrong here is a keystroke
 * reaching a host nobody armed, and nothing shows it until it has.
 */

import type { ComponentKind, Link, Workspace } from '../../ipc';

import { findComponent } from './model';

/** Which lines a component may hold: terminals join terminals, file
    browsers join file browsers, and a monitor holds none. */
export type Family = 'terminal' | 'files';

export function familyOf(kind: ComponentKind): Family | null {
  switch (kind) {
    case 'ssh':
      return 'terminal';
    case 'sftp':
    case 'local':
      return 'files';
    case 'monitor':
      return null;
  }
}

export type LinkRefusal =
  | { readonly reason: 'unknown' }
  | { readonly reason: 'self' }
  | { readonly reason: 'family' }
  /** This machine to itself: there is nowhere for a file to go. */
  | { readonly reason: 'local' }
  | { readonly reason: 'duplicate' };

export type LinkOutcome =
  | { readonly ok: true; readonly workspace: Workspace; readonly link: Link }
  | { readonly ok: false; readonly refusal: LinkRefusal };

/** One name for a line whichever end is given first, for React keys and menus. */
export function lineKey(link: Link): string {
  return [link.a, link.b].sort().join('~');
}

function sameLine(link: Link, a: string, b: string): boolean {
  return (link.a === a && link.b === b) || (link.a === b && link.b === a);
}

/**
 * Why a line from `a` to `b` cannot be drawn, or `null` when it can.
 *
 * A terminal line already there in either order is a duplicate; a
 * file-browser line is a duplicate only in the same direction, since two
 * browsers may each send to the other.
 */
export function canLink(workspace: Workspace, a: string, b: string): LinkRefusal | null {
  if (a === b) return { reason: 'self' };
  const from = findComponent(workspace, a);
  const to = findComponent(workspace, b);
  if (from === undefined || to === undefined) return { reason: 'unknown' };
  const family = familyOf(from.kind);
  if (family === null || family !== familyOf(to.kind)) return { reason: 'family' };
  if (from.kind === 'local' && to.kind === 'local') return { reason: 'local' };
  const taken =
    family === 'terminal'
      ? workspace.links.some((link) => sameLine(link, a, b))
      : workspace.links.some((link) => link.a === a && link.b === b);
  if (taken) return { reason: 'duplicate' };
  return null;
}

export function addLink(workspace: Workspace, a: string, b: string): LinkOutcome {
  const refusal = canLink(workspace, a, b);
  if (refusal !== null) return { ok: false, refusal };
  const link: Link = { a, b };
  return { ok: true, link, workspace: { ...workspace, links: [...workspace.links, link] } };
}

/** Removes the line between `a` and `b`, whichever way it was drawn. */
export function removeLink(workspace: Workspace, a: string, b: string): Workspace {
  return { ...workspace, links: workspace.links.filter((link) => !sameLine(link, a, b)) };
}

/**
 * Where a file browser's lines go: the components it is the origin of, in
 * the order the lines were drawn (ADR-0065 rule 2: `a` is the origin).
 */
export function destinationsOf(workspace: Workspace, id: string): readonly string[] {
  return workspace.links.filter((link) => link.a === id).map((link) => link.b);
}

function terminalLinks(workspace: Workspace): readonly Link[] {
  return workspace.links.filter((link) => {
    const from = findComponent(workspace, link.a);
    const to = findComponent(workspace, link.b);
    return from?.kind === 'ssh' && to?.kind === 'ssh';
  });
}

/**
 * The connected sets of the terminal lines, each sorted, sets of two or
 * more only: a terminal with no line is its own set and needs no listing.
 */
export function linkedSets(workspace: Workspace): readonly (readonly string[])[] {
  const links = terminalLinks(workspace);
  const seen = new Set<string>();
  const out: (readonly string[])[] = [];
  for (const link of links) {
    for (const start of [link.a, link.b]) {
      if (seen.has(start)) continue;
      const set = walk(links, start);
      set.forEach((id) => seen.add(id));
      out.push(set);
    }
  }
  return out;
}

/** The set `id` is on, `id` alone when it holds no terminal line. */
export function linkedSet(workspace: Workspace, id: string): readonly string[] {
  const component = findComponent(workspace, id);
  if (component?.kind !== 'ssh') return [id];
  return walk(terminalLinks(workspace), id);
}

function walk(links: readonly Link[], start: string): readonly string[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const here = queue.shift();
    if (here === undefined) break;
    for (const link of links) {
      const other = link.a === here ? link.b : link.b === here ? link.a : null;
      if (other !== null && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return [...seen].sort();
}

/**
 * The switch's key: the members, sorted and joined. A line added or removed
 * changes the members and so the key, which is how ADR-0019's "the switch
 * disarms itself whenever the set changes" holds without a listener: the
 * old key names a set that no longer exists.
 */
export function setKey(members: readonly string[]): string {
  return [...members].sort().join('+');
}

/**
 * The components receiving a broadcast right now: on an armed set, open,
 * and not muted; and only from a set with two or more of those, since one
 * receiving window would send exactly where an unarmed keystroke goes
 * while the screen claimed otherwise.
 */
export function mapReceiving(
  workspace: Workspace,
  armed: ReadonlySet<string>,
  muted: ReadonlySet<string>,
  open: ReadonlySet<string>,
): readonly string[] {
  const out: string[] = [];
  for (const set of linkedSets(workspace)) {
    if (!armed.has(setKey(set))) continue;
    const receiving = set.filter((id) => open.has(id) && !muted.has(id));
    if (receiving.length < 2) continue;
    out.push(...receiving);
  }
  return out;
}

/** What a set's switch shows: off; on, with somebody to reach; or armed
    with nobody to reach, which ADR-0019's one-receiving-is-none rule makes
    a state of its own. */
export type SwitchState = 'off' | 'idle' | 'on';

/**
 * The switch of the set `members` belong to, given who is receiving.
 *
 * `idle` is the case a person makes by sparing one of two windows: the set
 * is armed, the status bar says nothing is synchronised, and a switch that
 * still read "on" would be the map contradicting the status bar. The line
 * and the switch draw this state; `mapReceiving` already decides it.
 */
export function switchState(members: readonly string[], armed: ReadonlySet<string>, receiving: readonly string[]): SwitchState {
  if (members.length < 2 || !armed.has(setKey(members))) return 'off';
  return members.some((id) => receiving.includes(id)) ? 'on' : 'idle';
}

/**
 * Which hosts a keystroke typed in the window of `fromHost` reaches.
 *
 * Named by host because that is what the terminal that produced the bytes
 * knows, and a host carries at most one terminal on the map (ADR-0064).
 * A host off the map, or one whose window is not receiving, reaches only
 * itself: the blast radius of this switch is larger than one host, and
 * "cannot happen" is not a reason to widen it.
 */
export function mapInputTargets(
  workspace: Workspace,
  fromHost: string,
  armed: ReadonlySet<string>,
  muted: ReadonlySet<string>,
  open: ReadonlySet<string>,
): readonly string[] {
  const from = workspace.components.find((component) => component.kind === 'ssh' && component.host === fromHost);
  if (from === undefined) return [fromHost];
  const receiving = mapReceiving(workspace, armed, muted, open);
  if (!receiving.includes(from.id)) return [fromHost];
  const set = new Set(linkedSet(workspace, from.id));
  return receiving
    .filter((id) => set.has(id))
    .map((id) => findComponent(workspace, id)?.host)
    .filter((host): host is string => host !== undefined);
}
