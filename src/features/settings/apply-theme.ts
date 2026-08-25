/**
 * Stamping the chosen palette onto the document.
 *
 * A function over an element rather than a call to `document`, so the three
 * cases can be tested without a DOM. There is no jsdom in this repository and
 * this is not worth adding one for.
 */

import type { Theme } from '../../ipc/settings';

/** The part of an element this needs, which keeps the tests honest and small. */
export interface Root {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * Writes `data-theme`, or clears it to follow the desktop.
 *
 * Clearing rather than writing `system` is the whole mechanism.
 * `src/styles/tokens.css` paints dark on bare `:root` and light under
 * `prefers-color-scheme` for a root carrying no attribute, so the absence of
 * the attribute *is* following the system. A `data-theme="system"` would match
 * neither block and pin the window to dark on a light desktop.
 */
export function applyTheme(root: Root, theme: Theme): void {
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
