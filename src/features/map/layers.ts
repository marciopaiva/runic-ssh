/**
 * The layer: a map inside the map, one level deep (ADR-0068).
 *
 * A layer holds components and visions, never a layer: `componentsOn` and
 * `visionsOn` already take the level to filter by, and a layer's own id is
 * exactly what they are called with once entered. What this module adds is
 * the layer itself: creating one, naming it, moving its monolith, and
 * removing it, which moves what it held back to the outermost map rather
 * than closing anything, since a session does not belong to a layer.
 *
 * Pure, like the rest of the slice: `tests/map-layers.test.ts` holds these
 * without a DOM.
 */

import type { Component, Layer, Point, Vision, Workspace } from '../../ipc';

/** The store's own ceiling on a name (`MAX_NAME_LEN` in `config/workspace.rs`). */
export const MAX_LAYER_NAME = 80;

export type LayerOutcome =
  | { readonly ok: true; readonly workspace: Workspace; readonly layer: Layer }
  | { readonly ok: false; readonly reason: 'name' | 'duplicate' };

function acceptableName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length === 0 || trimmed.length > MAX_LAYER_NAME ? null : trimmed;
}

/** Whether `name` is already another layer's, trimmed the way the core
    compares them (`validate`'s own uniqueness rule). `except` is the layer
    being renamed, excluded from its own collision. */
function taken(workspace: Workspace, name: string, except: string | null): boolean {
  return workspace.layers.some((layer) => layer.id !== except && layer.name.trim() === name);
}

/** An id no layer has, by the same scheme a component's and a vision's are. */
export function newLayerId(workspace: Workspace, now: number = Date.now()): string {
  const had = new Set(workspace.layers.map((layer) => layer.id));
  for (let attempt = 0; ; attempt += 1) {
    const candidate = `l_${now.toString(36)}${attempt === 0 ? '' : `_${attempt}`}`;
    if (!had.has(candidate)) return candidate;
  }
}

export function findLayer(workspace: Workspace, id: string): Layer | undefined {
  return workspace.layers.find((layer) => layer.id === id);
}

/** A new layer, placed where asked or left to the map. Refuses an empty or
    over-long name, and a name another layer already has: two layers with
    the same name would be two crumbs saying one thing. */
export function addLayer(workspace: Workspace, name: string, position?: Point, now?: number): LayerOutcome {
  const trimmed = acceptableName(name);
  if (trimmed === null) return { ok: false, reason: 'name' };
  if (taken(workspace, trimmed, null)) return { ok: false, reason: 'duplicate' };
  const layer: Layer = {
    id: newLayerId(workspace, now),
    name: trimmed,
    ...(position === undefined ? {} : { position }),
  };
  return { ok: true, layer, workspace: { ...workspace, layers: [...workspace.layers, layer] } };
}

function replaceLayer(workspace: Workspace, id: string, change: (layer: Layer) => Layer): Workspace {
  return { ...workspace, layers: workspace.layers.map((layer) => (layer.id === id ? change(layer) : layer)) };
}

/** Renamed, trimmed; a name the store would refuse (empty, over-long, or
    another layer's) leaves the old one. */
export function renameLayer(workspace: Workspace, id: string, name: string): LayerOutcome {
  const trimmed = acceptableName(name);
  if (trimmed === null) return { ok: false, reason: 'name' };
  if (taken(workspace, trimmed, id)) return { ok: false, reason: 'duplicate' };
  const layer = findLayer(workspace, id);
  if (layer === undefined) return { ok: false, reason: 'name' };
  return { ok: true, layer: { ...layer, name: trimmed }, workspace: replaceLayer(workspace, id, (one) => ({ ...one, name: trimmed })) };
}

/** Where the user left the monolith. */
export function moveLayer(workspace: Workspace, id: string, position: Point): Workspace {
  return replaceLayer(workspace, id, (layer) => ({ ...layer, position }));
}

/**
 * Removes a layer, moving what it held back to the outermost map rather
 * than closing anything: every component and every vision that named it
 * loses that field, and its own position with it, so the ring places each
 * one fresh rather than piling them up at coordinates that meant something
 * one level in and mean nothing here. A member of a vision that was pinned
 * flows in the grid instead, the same state "back to the grid" already
 * leaves a member in; the vision itself keeps the member, only the pin is
 * gone.
 */
export function removeLayer(workspace: Workspace, id: string): Workspace {
  const free = (component: Component): Component => {
    if (component.layer !== id) return component;
    const { layer: _layer, position: _position, ...rest } = component;
    return rest;
  };
  const freeVision = (vision: Vision): Vision => {
    if (vision.layer !== id) return vision;
    const { layer: _layer, position: _position, ...rest } = vision;
    return rest;
  };
  return {
    ...workspace,
    layers: workspace.layers.filter((layer) => layer.id !== id),
    components: workspace.components.map(free),
    visions: workspace.visions.map(freeVision),
  };
}
