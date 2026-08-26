/**
 * The webview's own context menu, and the one thing that keeps it off the
 * session list.
 *
 * The defect this guards was not a wrong menu item. It was a menu we never
 * wrote, offering Reload over a document that holds every open session, with no
 * warning where closing a group's tabs gives one (#179). The connections
 * survived the reload; nothing on screen did.
 *
 * The rule has to let one case through, and that is the half worth asserting:
 * over a text entry control the same menu carries editing and no navigation,
 * and it is the only way to paste with the pointer.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { nativeMenuAllowed } from '../src/features/chrome/context-menu';
import type { MenuTarget } from '../src/features/chrome/context-menu';

/** An element that answers `closest` from a list of what it sits inside. */
function target(...ancestors: string[]): MenuTarget {
  return {
    closest(selectors: string): unknown {
      const wanted = selectors.split(',').map((one) => one.trim());
      return ancestors.some((one) => wanted.includes(one)) ? {} : null;
    },
  };
}

describe('where the webview may open its own menu', () => {
  it.each(['input', 'textarea'])('lets it through over a %s', (control) => {
    expect(nativeMenuAllowed(target(control))).toBe(true);
  });

  it('lets it through over the terminal, where paste comes from', () => {
    /* xterm reads what the pointer pastes out of a helper textarea, and the
       `paste` event that produces is the one `use-terminal.ts` intercepts. So
       this menu's Paste is still asked about by `PasteConfirm`. */
    expect(nativeMenuAllowed(target('textarea', 'div'))).toBe(true);
  });

  it.each([
    ['the session list', 'ul'],
    ['a group of tabs', 'div'],
    ['the status bar', 'footer'],
  ])('refuses it over %s', (_where, element) => {
    expect(nativeMenuAllowed(target(element))).toBe(false);
  });

  it('refuses it when there is no element under the pointer', () => {
    expect(nativeMenuAllowed(null)).toBe(false);
  });
});

describe('the rule is installed', () => {
  /* A predicate nothing calls is a predicate that passes its own tests while
     the window keeps its menu. There is no jsdom here to mount the entry point
     into, so the assertion is on the source, the way `theme-choice.test.ts`
     holds the entry point to not pinning `data-theme`. */
  const source = readFileSync(
    fileURLToPath(new URL('../src/main.tsx', import.meta.url)),
    'utf8',
  );

  it('by the main window, on its own document', () => {
    expect(source).toContain('refuseNavigationMenu(document)');
  });

  it('and not by the credential window', () => {
    /* ADR-0008 keeps that document small, and #116 has still not confirmed that
       a password can be pasted into it at all. Taking its menu away would
       remove the pointer route being asked about. */
    const credential = readFileSync(
      fileURLToPath(new URL('../src/credential/main.tsx', import.meta.url)),
      'utf8',
    );

    expect(credential).not.toContain('refuseNavigationMenu');
  });
});
