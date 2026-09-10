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
 * the host's one connection without one (ADR-0053).
 */
export type ComponentKind = 'ssh' | 'sftp' | 'monitor';

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
  /** The saved session this opens on, by id. */
  readonly host: string;
  /** The layer this sits in; absent on the outermost map. */
  readonly layer?: string;
  /** Where the user left it; absent to let the map place it. */
  readonly position?: Point;
  /** The window size the user chose; absent for the kind's default. */
  readonly size?: Size;
}

/** A line between two components of the same kind (v0.7.0). */
export interface Link {
  readonly a: string;
  readonly b: string;
}

/** A named set of components that lays itself out (v0.8.0). */
export interface Vision {
  readonly id: string;
  readonly name: string;
  readonly components: readonly string[];
  readonly open: boolean;
  readonly layer?: string;
}

/** A map inside the map (v0.9.0). */
export interface Layer {
  readonly id: string;
  readonly name: string;
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
