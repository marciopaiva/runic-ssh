/**
 * Typed wrapper over the macro commands.
 *
 * A macro is a name and a block of text sent to a terminal as though typed.
 * Nothing here is a secret, and nothing here touches a session directly:
 * sending the text to one is `features/macros`' own job, the same way
 * `send_input` never knows about broadcast.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * How a macro's text reaches the terminal (ADR-0070).
 *
 * `sequential` types the text into the shell that is already open, exactly
 * the way every macro worked before this existed. `script` wraps it in a
 * heredoc piped into a fresh interpreter instead: isolated from the session
 * it runs in, with `$host`/`$port`/`$username` as that interpreter's own
 * variables rather than text substituted ahead of time. See
 * `features/macros/script.ts` for the wrapping itself; the core only
 * remembers which one a saved macro asked for.
 */
export type MacroKind = 'sequential' | 'script';

/** A saved macro. */
export interface Macro {
  readonly id: string;
  readonly name: string;
  readonly kind: MacroKind;
  /** A `sequential` macro's own text, sent as saved (a run still ensures a
      trailing newline, so the last line is not left typed but never
      submitted). A `script` macro's text is the body a heredoc wraps
      around; what actually reaches the terminal for one is not this
      string alone. */
  readonly text: string;
}

/** What the interface sends when saving. */
export interface MacroDraft {
  /** Absent when creating; present when editing the macro it names. */
  readonly id?: string;
  readonly name: string;
  readonly kind: MacroKind;
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
