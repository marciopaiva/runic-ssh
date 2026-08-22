/**
 * The terminal palette is part of the theme, not an exception to it.
 *
 * This is the surface a user stares at for hours. A colour hard-coded here
 * would ignore the active theme silently, and would be the last place anyone
 * looked — the token guard caught exactly that when this file was first
 * written with fallback literals.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TERMINAL_TOKENS } from '../src/features/terminal/theme';

const tokensCss = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

describe('the terminal palette', () => {
  it.each(TERMINAL_TOKENS)('reads %s, which the theme defines', (name) => {
    /* A token the terminal asks for and the theme does not define throws at
       runtime, in the middle of opening a session. Catching it here is the
       difference between a failing test and a broken terminal. */
    expect(
      tokensCss.includes(`${name}:`),
      `${name} is used by the terminal but not defined in tokens.css`,
    ).toBe(true);
  });

  it('defines every terminal token in both themes', () => {
    for (const name of TERMINAL_TOKENS) {
      const occurrences = tokensCss.split(`${name}:`).length - 1;
      expect(
        occurrences,
        `${name} is defined ${occurrences} times; it needs dark plus both light blocks`,
      ).toBe(3);
    }
  });
});
