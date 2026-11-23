/**
 * What the right button offers over a terminal pane: copy and paste (#460).
 *
 * Copy with nothing selected is offered and cannot be taken, so the entry says
 * what the gesture is for without pretending to do it. Paste is greyed where a
 * scripted paste cannot work (`lib/platform.ts`), its shortcut still the way
 * in. Pure, so the list can be asserted for every state without a terminal.
 */

export type TerminalMenuId = 'copy' | 'paste';

export interface TerminalMenuEntry {
  readonly id: TerminalMenuId;
  readonly disabled: boolean;
}

export interface TerminalMenuState {
  readonly hasSelection: boolean;
  /** False on Linux/WebKitGTK, where a scripted paste does nothing
      (`docs/measurements/terminal-menu-clipboard.md`): the entry stays,
      greyed, its shortcut still the way in (#381). */
  readonly pasteAllowed: boolean;
}

export function terminalMenu({ hasSelection, pasteAllowed }: TerminalMenuState): readonly TerminalMenuEntry[] {
  return [
    { id: 'copy', disabled: !hasSelection },
    { id: 'paste', disabled: !pasteAllowed },
  ];
}
