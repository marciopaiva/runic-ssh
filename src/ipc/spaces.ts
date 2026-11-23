/**
 * Typed wrapper over the Space commands (ADR-0081).
 *
 * A Space is an environment: a name and a weight. A host names its Space with
 * an optional `space` id, and one with none, or with an id that is no longer
 * saved, is in the default Space. Nothing here is a secret. The weight is a
 * guard against a slip, not a security control, and the core enforces nothing
 * with it.
 */

import { invoke } from '@tauri-apps/api/core';

/** How much care a Space asks for before a command reaches several hosts. */
export type SpaceWeight = 'normal' | 'production';

/** A saved Space. Its position in the list is its order. */
export interface Space {
  readonly id: string;
  readonly name: string;
  readonly weight: SpaceWeight;
}

/** What the interface sends when saving. */
export interface SpaceDraft {
  /** Absent when creating; present when editing the Space it names. */
  readonly id?: string;
  readonly name: string;
  readonly weight: SpaceWeight;
}

export async function listSpaces(): Promise<readonly Space[]> {
  return invoke<Space[]>('list_spaces');
}

/** Creates a Space at the end, or replaces the one the draft names. */
export async function saveSpace(draft: SpaceDraft): Promise<Space> {
  return invoke<Space>('save_space', { draft });
}

export async function deleteSpace(id: string): Promise<void> {
  return invoke<void>('delete_space', { id });
}

/** Puts the Spaces in the order given, which must be every saved id once. */
export async function reorderSpaces(order: readonly string[]): Promise<readonly Space[]> {
  return invoke<Space[]>('reorder_spaces', { order });
}
