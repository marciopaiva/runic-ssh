/**
 * What the right button offers over a terminal window on the map (#115).
 *
 * Copy, paste, and the two things a map window can do that a pane cannot:
 * start a line, and spare itself from one. No split entries: a map window
 * has none. Pure, so the list can be asserted for every state without a
 * terminal, and so the menu and the radial cannot disagree about it.
 */

export type TerminalMenuId = 'copy' | 'paste' | 'broadcast' | 'mute' | 'unmute';

export interface TerminalMenuEntry {
  readonly id: TerminalMenuId;
  /** Copy with nothing selected is offered and cannot be taken, so the
      entry says what the gesture is for without pretending to do it. */
  readonly disabled: boolean;
}

export interface TerminalMenuState {
  readonly hasSelection: boolean;
  /** Whether another terminal exists for a line to reach. */
  readonly reachable: boolean;
  /** The window's place on an armed set, or `null` off any. */
  readonly broadcast: 'receiving' | 'muted' | 'armed' | null;
  /** False on Linux/WebKitGTK, where a scripted paste does nothing
      (`docs/measurements/terminal-menu-clipboard.md`): the entry stays,
      greyed, its shortcut still the way in (#381). */
  readonly pasteAllowed: boolean;
}

export function terminalMenu({ hasSelection, reachable, broadcast, pasteAllowed }: TerminalMenuState): readonly TerminalMenuEntry[] {
  const entries: TerminalMenuEntry[] = [
    { id: 'copy', disabled: !hasSelection },
    { id: 'paste', disabled: !pasteAllowed },
  ];
  if (reachable) entries.push({ id: 'broadcast', disabled: false });
  if (broadcast === 'muted') entries.push({ id: 'unmute', disabled: false });
  else if (broadcast !== null) entries.push({ id: 'mute', disabled: false });
  return entries;
}
