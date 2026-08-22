/**
 * The terminal's colours, read from the design tokens.
 *
 * `xterm.js` takes literal colour strings rather than CSS variables, so the
 * values are resolved from the document when a terminal is built.
 *
 * There are deliberately **no fallback literals here**. A hard-coded colour in
 * this file would be the one surface the user stares at, quietly ignoring the
 * theme — which is exactly what the guard in `tests/design-tokens.test.ts`
 * exists to prevent, and it caught this file when the fallbacks were present.
 * A missing token throws instead, naming itself, because a terminal painted in
 * empty strings is not a fallback, it is a bug that looks like a design.
 */

import type { ITheme } from '@xterm/xterm';

function token(name: string): string {
  if (typeof document === 'undefined') {
    throw new Error(`${name} cannot be resolved without a document`);
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value === '') {
    throw new Error(`the design token ${name} is not defined`);
  }
  return value;
}

/** Builds the terminal palette from whatever theme is active right now. */
export function terminalTheme(): ITheme {
  return {
    background: token('--rs-surface-terminal'),
    foreground: token('--rs-text-secondary'),
    cursor: token('--rs-accent'),
    cursorAccent: token('--rs-surface-terminal'),
    selectionBackground: token('--rs-accent-soft'),

    black: token('--rs-surface-base'),
    red: token('--rs-state-danger'),
    green: token('--rs-state-ok'),
    yellow: token('--rs-state-warn'),
    blue: token('--rs-accent'),
    magenta: token('--rs-brand-end'),
    cyan: token('--rs-accent-bright'),
    white: token('--rs-text-secondary'),

    brightBlack: token('--rs-text-faint'),
    brightRed: token('--rs-state-danger-text'),
    brightGreen: token('--rs-state-ok'),
    brightYellow: token('--rs-state-warn'),
    brightBlue: token('--rs-accent-bright'),
    brightMagenta: token('--rs-brand-end'),
    brightCyan: token('--rs-accent-bright'),
    brightWhite: token('--rs-text-primary'),
  };
}

/** Every token the terminal palette depends on, for the guard test. */
export const TERMINAL_TOKENS = [
  '--rs-surface-terminal',
  '--rs-text-secondary',
  '--rs-accent',
  '--rs-accent-soft',
  '--rs-surface-base',
  '--rs-state-danger',
  '--rs-state-ok',
  '--rs-state-warn',
  '--rs-brand-end',
  '--rs-accent-bright',
  '--rs-text-faint',
  '--rs-state-danger-text',
  '--rs-text-primary',
] as const;
