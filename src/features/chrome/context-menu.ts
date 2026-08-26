/**
 * The webview's own context menu, and where it is allowed to open.
 *
 * We never wrote this menu and cannot choose what is on it. Over ordinary
 * content WebKitGTK offers navigation, **Reload** included, and reload restarts
 * the document. This document holds every open session, so one click on a menu
 * item empties the window while the connections stay authenticated on the far
 * side, named nowhere and reachable by nothing left on screen. Closing a
 * group's tabs asks first and says how many sessions go with it; that path did
 * not ask at all (#179).
 *
 * Over a text entry control the same menu carries editing instead, and no
 * Reload. That menu is worth keeping: it is the only pointer-driven way to
 * paste in this window, and a paste into the terminal arrives as an ordinary
 * `paste` event, so the confirmation in `use-terminal.ts` still sees it and
 * `PasteConfirm` still asks.
 *
 * So the rule is not "no menu". It is the menu where it can only edit, and
 * nothing where it can navigate. Cut and Copy still come up greyed out over the
 * terminal, which is its own small lie; #115 replaces that half with a menu we
 * do write, and this stays as the answer for everywhere else.
 *
 * The credential window deliberately does not install this. Its document holds
 * no session to lose, and its native menu is the pointer route to paste a
 * password that #116 exists to confirm.
 */

/** Where the native menu can only edit, so it is safe to let through. */
const EDITING = 'input, textarea';

/** The part of the element under the pointer that the decision needs. */
export interface MenuTarget {
  closest(selectors: string): unknown;
}

/**
 * Whether the webview's menu may open over this element.
 *
 * `closest` rather than a tag test, because the target is whatever was under
 * the pointer and inside a control that is often a child of it. xterm's helper
 * textarea is matched by the same selector, which is deliberate: that is where
 * a paste into the terminal comes from.
 */
export function nativeMenuAllowed(target: MenuTarget | null): boolean {
  return target !== null && target.closest(EDITING) !== null;
}

/**
 * Installs the rule on a document, and returns the way to take it off.
 *
 * Thin on purpose. Everything worth asserting is in `nativeMenuAllowed`, which
 * needs no DOM to answer; this is the wiring, and there is no jsdom in this
 * repository to render it into.
 */
export function refuseNavigationMenu(root: Document): () => void {
  const listener = (event: Event): void => {
    if (event.target instanceof Element && nativeMenuAllowed(event.target)) return;

    event.preventDefault();
  };

  root.addEventListener('contextmenu', listener);

  return () => {
    root.removeEventListener('contextmenu', listener);
  };
}
