/**
 * The palette the user chose, and the one thing that makes it reachable.
 *
 * `tokens.css` has defined a light palette since the tokens existed, and until
 * this it was unreachable without changing the operating system: nothing ever
 * wrote `data-theme`. The guard in `design-tokens.test.ts` says the entry point
 * must not write it. This one says something must.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyTheme } from '../src/features/settings/apply-theme';
import type { Root } from '../src/features/settings/apply-theme';
import type { Theme } from '../src/ipc/settings';

/** A root that records what was done to it, which is all this needs. */
function root(): Root & { attribute: string | null } {
  return {
    attribute: null,
    setAttribute(name: string, value: string) {
      if (name === 'data-theme') this.attribute = value;
    },
    removeAttribute(name: string) {
      if (name === 'data-theme') this.attribute = null;
    },
  };
}

const source = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8');

describe('stamping the chosen palette', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('writes data-theme for %s', (theme, expected) => {
    const element = root();
    applyTheme(element, theme);

    expect(element.attribute).toBe(expected);
  });

  it('clears the attribute to follow the desktop', () => {
    /* Not `data-theme="system"`: that matches neither the media query block nor
       the explicit one, so it would pin a light desktop to dark. The absence of
       the attribute is what following the system means in `tokens.css`. */
    const element = root();
    applyTheme(element, 'dark');
    applyTheme(element, 'system');

    expect(element.attribute).toBeNull();
  });

  it('never writes the word system', () => {
    const values: string[] = [];
    const recorder: Root = {
      setAttribute: (_name, value) => values.push(value),
      removeAttribute: () => undefined,
    };

    for (const theme of ['system', 'light', 'dark'] satisfies Theme[]) {
      applyTheme(recorder, theme);
    }

    expect(values).toEqual(['light', 'dark']);
  });
});

describe('the light theme is reachable at all', () => {
  it('has the settings context apply the theme', () => {
    /* The counterpart to `design-tokens.test.ts` refusing `data-theme` in the
       entry point. That guard alone is satisfied by an application that writes
       the attribute nowhere, which is the state this issue found: every light
       token defined, every test green, and no way to see any of them. */
    const context = source('features/settings/settings-context.tsx');

    expect(context).toContain('applyTheme(document.documentElement');
  });

  it('offers all three choices on Home\'s own toolbar', () => {
    /* A control that offers two of them is the boolean this deliberately is
       not: "follow the system" has to stay reachable after a user has picked
       something else, or the choice is one way. Moved here from a dashboard
       card (ADR-0052, once the card itself went with Home's own Dashboard
       section). Folded behind one button since (found comparing directly
       against `ShapeControl`/`SftpSplitControl`, the toolbar's own answer
       for "which one of several is this" elsewhere): a `menu` of
       `menuitemradio` options, the same roles those two already use, not
       three chips in a `radiogroup`. `THEMES` is where all three actually
       live; `onChoose(kind)` is one call site iterating it, not three
       literal calls naming each theme, so this checks the array has all
       three rather than grepping for a call that no longer exists. */
    const controls = source('components/ThemeLanguageControls.tsx');

    for (const theme of ['system', 'light', 'dark'] satisfies Theme[]) {
      expect(controls).toContain(`'${theme}'`);
    }
    expect(controls).toContain('role="menu"');
    expect(controls).toContain('role="menuitemradio"');
  });
});
