/**
 * Typed wrapper over the map workspace commands.
 *
 * ADR-0064: the map lives in `workspace.json` beside the host book and points
 * into it by id. Nothing here is a secret and nothing here is an address.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Which surface a component opens on its host.
 *
 * Only `'ssh'` ever asks the core for a shell; `'sftp'` and `'monitor'` share
 * the host's one connection without one (ADR-0053). `'local'` is the file
 * browser of this machine (ADR-0065): no host, no connection, one per layer.
 */
export type ComponentKind = 'ssh' | 'sftp' | 'monitor' | 'local';

/** A place on the map, in map pixels at 100%. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A window size, in map pixels at 100%. */
export interface Size {
  readonly w: number;
  readonly h: number;
}

/** One kind of surface on one saved host. */
export interface Component {
  /** Stable for the life of the component; what a line or a vision names. */
  readonly id: string;
  readonly kind: ComponentKind;
  /** The saved session this opens on, by id; absent on `'local'`, the one
      kind with no session, and present on every other. */
  readonly host?: string;
  /** The layer this sits in; absent on the outermost map. */
  readonly layer?: string;
  /** Where the user left it; absent to let the map place it. Relative to
      the vision's `position` while the component is a member, and then its
      presence is the pin (ADR-0067). */
  readonly position?: Point;
  /** The window size the user chose; absent for the kind's default. */
  readonly size?: Size;
}

/**
 * A line between two components of one family (ADR-0065). Between file
 * browsers the order is the direction: `a` the origin, `b` the destination.
 * Between terminals the order carries nothing.
 */
export interface Link {
  readonly a: string;
  readonly b: string;
}

/**
 * A named set of components that lays itself out (ADR-0067). `components`
 * is in the grid's order; a component is in at most one vision, on the
 * vision's own level.
 */
export interface Vision {
  readonly id: string;
  readonly name: string;
  readonly components: readonly string[];
  readonly open: boolean;
  readonly layer?: string;
  /** Where the aperture sits closed and the region's top-left corner sits
      open; absent to let the map place it. A member's own `position` is
      measured from here while it belongs to the vision. */
  readonly position?: Point;
}

/**
 * A map inside the map (ADR-0068). One level deep: a layer holds
 * components and visions, never a layer, and a line never joins two
 * components on different levels.
 */
export interface Layer {
  readonly id: string;
  /** Free text, and unique among layers: the crumb shows it. */
  readonly name: string;
  /** Where the monolith sits on the outermost ring; absent to let the map
      place it. Entering and leaving write nothing. */
  readonly position?: Point;
}

/**
 * Everything the Map workspace remembers between launches.
 *
 * `tests/ipc-contract.test.ts` pins the empty one against what the core
 * serializes, so a renamed array is a layout that silently stops arriving
 * rather than a compile error nobody sees.
 */
export interface Workspace {
  readonly components: readonly Component[];
  readonly links: readonly Link[];
  readonly visions: readonly Vision[];
  readonly layers: readonly Layer[];
}

export const EMPTY_WORKSPACE: Workspace = {
  components: [],
  links: [],
  visions: [],
  layers: [],
};

/** Reads the map, with components whose host left the book already dropped. */
export async function loadWorkspace(): Promise<Workspace> {
  return invoke<Workspace>('load_workspace');
}

/** Replaces the map with what the interface holds. Rejects with
    `invalidWorkspace` before anything is written. */
export async function saveWorkspace(workspace: Workspace): Promise<void> {
  return invoke<void>('save_workspace', { workspace });
}
