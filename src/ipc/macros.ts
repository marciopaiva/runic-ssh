/**
 * Typed wrapper over the macro commands.
 *
 * A macro is a name and a block of text sent to a terminal exactly as
 * saved, as though typed. Nothing here is a secret, and nothing here
 * touches a session directly: sending the text to one is `features/macros`'
 * own job, the same way `send_input` never knows about broadcast.
 */

import { invoke } from '@tauri-apps/api/core';

/** A saved macro. */
export interface Macro {
  readonly id: string;
  readonly name: string;
  /** Sent exactly as saved: whether it ends in a newline is up to the text. */
  readonly text: string;
}

/** What the interface sends when saving. */
export interface MacroDraft {
  /** Absent when creating; present when editing the macro it names. */
  readonly id?: string;
  readonly name: string;
  readonly text: string;
}

export async function listMacros(): Promise<readonly Macro[]> {
  return invoke<Macro[]>('list_macros');
}

/** Creates or replaces a macro, returning what was stored. */
export async function saveMacro(draft: MacroDraft): Promise<Macro> {
  return invoke<Macro>('save_macro', { draft });
}

export async function deleteMacro(id: string): Promise<void> {
  return invoke<void>('delete_macro', { id });
}
