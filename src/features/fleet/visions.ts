/**
 * A vision as a starting point for a fleet run (ADR-0078, #469).
 *
 * A vision names components and a component names a saved host, which is not
 * the same as a live session: some members may not be connected. A run only
 * reaches connected sessions, so a preset says which of its members it can
 * reach and which it leaves out, instead of leaving them out silently.
 */

import type { Component, Vision } from '../../ipc';
import type { SessionHandle } from '../../ipc/sessions';
import type { LiveSession } from '../sessions/state';

export interface VisionPreset {
  readonly id: string;
  readonly name: string;
  /** Connected members, in the vision's order, once each. */
  readonly handles: readonly SessionHandle[];
  /** Names of members that are not connected, left out of the run. */
  readonly skipped: readonly string[];
}

/** The visions that hold at least one saved host, as presets. */
export function visionPresets(
  workspace: { readonly components: readonly Component[]; readonly visions: readonly Vision[] },
  sessions: readonly LiveSession[],
): readonly VisionPreset[] {
  const componentById = new Map(workspace.components.map((component) => [component.id, component]));

  return workspace.visions.flatMap((vision) => {
    const seen = new Set<string>();
    const handles: SessionHandle[] = [];
    const skipped: string[] = [];

    for (const componentId of vision.components) {
      const host = componentById.get(componentId)?.host;
      if (host === undefined || seen.has(host)) continue;
      seen.add(host);

      const live = sessions.find((entry) => entry.session.id === host);
      if (live === undefined) continue;
      if (live.handle === null) skipped.push(live.session.name);
      else handles.push(live.handle);
    }

    return handles.length + skipped.length === 0
      ? []
      : [{ id: vision.id, name: vision.name, handles, skipped }];
  });
}
