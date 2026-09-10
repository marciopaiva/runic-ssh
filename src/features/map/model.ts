/**
 * What the map holds, and every way it changes.
 *
 * ADR-0064. A component is one kind of surface on one saved host, and the
 * whole map is one object the interface owns in memory and the core writes
 * whole. Every change below returns a new `Workspace` rather than mutating
 * the one it was given, so the shell can hand it to `saveWorkspace` and to
 * React in the same breath.
 *
 * Pure, for the reason `features/terminal/groups.ts` is: what goes wrong here
 * is a second shell asked for on a host that already has one, or a component
 * pointing at a host the book no longer has, and neither is visible until
 * somebody connects.
 */

import type { Component, ComponentKind, Point, Session, Size, Workspace } from '../../ipc';

/** The window a component opens at, per kind, in map pixels at 100%. */
export const DEFAULT_SIZE: Readonly<Record<ComponentKind, Size>> = {
  ssh: { w: 560, h: 360 },
  sftp: { w: 740, h: 420 },
  monitor: { w: 660, h: 380 },
};

/** Below this a window is a thumbnail, not a place to type. */
export const MIN_SIZE: Size = { w: 360, h: 200 };

/**
 * Why a component could not be added.
 *
 * `duplicate` restates ADR-0064's rule: a host carries at most one component
 * of each kind, because two SSH components would be two shells on one
 * connection, which the core refuses (ADR-0014) and which waits for #120.
 */
export type AddRefusal =
  | { readonly reason: 'duplicate'; readonly existing: Component }
  | { readonly reason: 'unknownHost' };

export type AddOutcome =
  | { readonly ok: true; readonly workspace: Workspace; readonly component: Component }
  | { readonly ok: false; readonly refusal: AddRefusal };

/** The components on one level of the map: the outermost when `layer` is `null`. */
export function componentsOn(workspace: Workspace, layer: string | null): readonly Component[] {
  return workspace.components.filter((component) => (component.layer ?? null) === layer);
}

export function findComponent(workspace: Workspace, id: string): Component | undefined {
  return workspace.components.find((component) => component.id === id);
}

/** The component of this kind on this host, if the map already has one. */
export function surfaceOn(
  workspace: Workspace,
  host: string,
  kind: ComponentKind,
): Component | undefined {
  return workspace.components.find((component) => component.host === host && component.kind === kind);
}

/**
 * An id that is stable, opaque and unique within the map.
 *
 * Time plus a counter rather than a hash: the core assigns ids for what it
 * stores itself (`config::macros::new_id`), but the map is written whole by
 * the interface, so the interface has to be able to name a component before
 * the core has seen it. Uniqueness is what matters and is what is asserted.
 */
export function newComponentId(workspace: Workspace, now: number = Date.now()): string {
  const taken = new Set(workspace.components.map((component) => component.id));
  for (let attempt = 0; ; attempt += 1) {
    const candidate = `c_${now.toString(36)}${attempt === 0 ? '' : `_${attempt}`}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Adds a component for a saved host, or says why not.
 *
 * `hosts` is the book: a component for a host that is not in it would be a
 * reference the store prunes on the next load, so it is refused here instead,
 * with a reason the picker can render.
 */
export function addComponent(
  workspace: Workspace,
  kind: ComponentKind,
  host: string,
  hosts: readonly Session[],
  layer: string | null = null,
  position?: Point,
  now?: number,
): AddOutcome {
  if (!hosts.some((session) => session.id === host)) {
    return { ok: false, refusal: { reason: 'unknownHost' } };
  }
  const existing = surfaceOn(workspace, host, kind);
  if (existing !== undefined) {
    return { ok: false, refusal: { reason: 'duplicate', existing } };
  }

  const component: Component = {
    id: newComponentId(workspace, now),
    kind,
    host,
    ...(layer === null ? {} : { layer }),
    ...(position === undefined ? {} : { position }),
  };

  return {
    ok: true,
    component,
    workspace: { ...workspace, components: [...workspace.components, component] },
  };
}

/** Removes a component, and any line or vision membership that named it. */
export function removeComponent(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    components: workspace.components.filter((component) => component.id !== id),
    links: workspace.links.filter((link) => link.a !== id && link.b !== id),
    visions: workspace.visions.map((vision) => ({
      ...vision,
      components: vision.components.filter((member) => member !== id),
    })),
  };
}

function replace(workspace: Workspace, id: string, change: (component: Component) => Component): Workspace {
  return {
    ...workspace,
    components: workspace.components.map((component) =>
      component.id === id ? change(component) : component,
    ),
  };
}

/**
 * Points a component at another saved host, keeping its place and size.
 *
 * The same duplicate rule as adding: the target host may not already carry
 * this kind. Pointing a component at the host it already has is a no-op.
 */
export function changeHost(
  workspace: Workspace,
  id: string,
  host: string,
  hosts: readonly Session[],
): AddOutcome {
  const current = findComponent(workspace, id);
  if (current === undefined || !hosts.some((session) => session.id === host)) {
    return { ok: false, refusal: { reason: 'unknownHost' } };
  }
  if (current.host === host) return { ok: true, workspace, component: current };

  const existing = surfaceOn(workspace, host, current.kind);
  if (existing !== undefined) {
    return { ok: false, refusal: { reason: 'duplicate', existing } };
  }

  const component: Component = { ...current, host };
  return { ok: true, component, workspace: replace(workspace, id, () => component) };
}

/** Where the user left it. */
export function moveComponent(workspace: Workspace, id: string, position: Point): Workspace {
  return replace(workspace, id, (component) => ({ ...component, position }));
}

/** Back to letting the map place it. */
export function resetPosition(workspace: Workspace, id: string): Workspace {
  return replace(workspace, id, ({ position: _dropped, ...component }) => component);
}

/** The size the user pulled it to, never below {@link MIN_SIZE}. */
export function resizeComponent(workspace: Workspace, id: string, size: Size): Workspace {
  const clamped: Size = {
    w: Math.max(MIN_SIZE.w, Math.round(size.w)),
    h: Math.max(MIN_SIZE.h, Math.round(size.h)),
  };
  return replace(workspace, id, (component) => ({ ...component, size: clamped }));
}

/** Back to the kind's default. */
export function defaultSize(workspace: Workspace, id: string): Workspace {
  return replace(workspace, id, ({ size: _dropped, ...component }) => component);
}

/** The size a component's window has: what the user chose, or the kind's default. */
export function sizeOf(component: Component): Size {
  return component.size ?? DEFAULT_SIZE[component.kind];
}

/**
 * What the map asked the host editor for, so the host it saves lands where
 * it was asked: a new component of `kind`, the host of the component
 * `changing`, or nothing when the editor was opened only to change a host's
 * details (#357).
 */
export interface HostAsk {
  readonly kind: ComponentKind | null;
  readonly changing: string | null;
}

/**
 * The map after the editor saved `host`: the component the ask was for, or
 * the map unchanged when nothing was asked. `null` when the model refuses,
 * which is the picker's own refusal (a duplicate, an unknown host) reached
 * by another door; the caller reports it the way the picker would.
 */
export function placeSavedHost(
  workspace: Workspace,
  ask: HostAsk,
  host: string,
  hosts: readonly Session[],
): Workspace | null {
  if (ask.changing !== null) {
    const outcome = changeHost(workspace, ask.changing, host, hosts);
    return outcome.ok ? outcome.workspace : null;
  }
  if (ask.kind !== null) {
    const outcome = addComponent(workspace, ask.kind, host, hosts);
    return outcome.ok ? outcome.workspace : null;
  }
  return workspace;
}

