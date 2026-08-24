/**
 * What a keystroke means when the terminal has focus.
 *
 * A terminal cannot simply bind Ctrl-C to copy. Ctrl-C is how a person stops a
 * runaway process, and `ssh/terminal.rs` keeps the input path alive under
 * buffer pressure for exactly that reason. So the decision has to be made per
 * keystroke, from what is on screen, and it is made here rather than inside the
 * effect that mounts the terminal so it can be asserted without rendering one.
 *
 * The mechanism this feeds is small. `attachCustomKeyEventHandler` returning
 * `false` makes xterm return from its key handler before it calls
 * `preventDefault`, and the browser then delivers the ordinary `copy` or
 * `paste` event to the handlers xterm already registers. Nothing here reads or
 * writes the clipboard, which is why none of this needs a permission: the
 * clipboard is touched by the person pressing the key, not by us.
 */

/** Whether a keystroke reaches the host, or does something local first. */
export type KeyIntent = 'copy' | 'paste' | 'send';

/**
 * What to do with a key the terminal just saw.
 *
 * `event.code` rather than `event.key`, for the reason `isPaletteShortcut`
 * gives: with Shift held, `key` is whatever the layout produces, and a shortcut
 * should follow the physical key.
 *
 * Ctrl-Insert and Shift-Insert are deliberately absent. xterm produces no key
 * for either, so it never cancels them, and the browser's own copy and paste
 * already run. Naming them here would change nothing except the size of this
 * function.
 */
export function keyIntent(
  event: Pick<KeyboardEvent, 'type' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
  hasSelection: boolean,
  modifier: 'meta' | 'control',
): KeyIntent {
  if (event.type !== 'keydown') return 'send';
  if (event.code !== 'KeyC' && event.code !== 'KeyV') return 'send';

  const copying = event.code === 'KeyC';

  /* A Mac has no conflict to resolve. Cmd-C and Ctrl-C are different keys, so
     Cmd-C can copy unconditionally and Ctrl-C stays interrupt. */
  if (modifier === 'meta') {
    if (!event.metaKey || event.ctrlKey || event.altKey) return 'send';
    return copying ? 'copy' : 'paste';
  }

  if (!event.ctrlKey || event.metaKey || event.altKey) return 'send';

  /* Ctrl-Shift-C and Ctrl-Shift-V are the terminal convention and always mean
     the clipboard. Neither produces a control code, so nothing is lost by
     taking them. */
  if (event.shiftKey) return copying ? 'copy' : 'paste';

  /* Ctrl-V has nothing to collide with. Ctrl-V sends 0x16, which no shell reads
     as anything a person meant to type. */
  if (!copying) return 'paste';

  /* The one real judgement call. With text selected, Ctrl-C copies it; with
     nothing selected there is nothing to copy and it is an interrupt. The
     caller drops the selection as soon as it is used, so a selection left on
     screen costs at most one Ctrl-C before the next one interrupts again. */
  return hasSelection ? 'copy' : 'send';
}

/**
 * Whether a paste has to be shown to the user before the host sees it.
 *
 * A shell runs each line of a paste as it arrives, so text carrying a newline
 * executes without anybody pressing Return. Bracketed paste closes this: the
 * remote shell asks for it, xterm wraps the text in the markers, and the shell
 * treats the whole thing as literal input. When it is off, the newline is the
 * whole attack, and the person pasting is the only one who can tell whether
 * they meant it.
 */
export function pasteNeedsConfirming(text: string, bracketedPasteMode: boolean): boolean {
  if (bracketedPasteMode) return false;

  /* A single trailing newline is somebody pasting one command and expecting it
     to run. Anything else puts a line break in the middle of the text. */
  return /[\r\n]/.test(text.replace(/[\r\n]+$/, ''));
}

/** How the confirmation describes what is about to run. */
export function pasteLines(text: string): readonly string[] {
  return text.replace(/[\r\n]+$/, '').split(/\r\n|\r|\n/);
}

/**
 * The bytes a confirmed paste sends.
 *
 * xterm normalises line endings before a paste reaches the host, turning every
 * newline into a carriage return, because that is the byte a terminal sends
 * when Return is pressed. A confirmed paste is delivered around xterm, so it
 * has to do the same or the shell receives line feeds and runs nothing.
 *
 * No bracketed paste markers: this path exists only for the case where the
 * remote shell did not ask for them.
 */
export function preparePaste(text: string): string {
  return text.replace(/\r?\n/g, '\r');
}
