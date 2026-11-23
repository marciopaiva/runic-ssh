/**
 * The terminal pane's context menu (#460): what it offers per state.
 */

import { describe, expect, it } from 'vitest';

import { terminalMenu } from '../src/features/terminal/menu';

const ids = (state: Parameters<typeof terminalMenu>[0]): readonly string[] =>
  terminalMenu(state).map((entry) => `${entry.id}${entry.disabled ? '!' : ''}`);

describe('the terminal pane menu', () => {
  it('always offers copy and paste, copy taken only with a selection', () => {
    expect(ids({ hasSelection: false, pasteAllowed: true })).toEqual(['copy!', 'paste']);
    expect(ids({ hasSelection: true, pasteAllowed: true })).toEqual(['copy', 'paste']);
  });

  it('greys paste where a scripted paste cannot work, keeping the entry', () => {
    expect(ids({ hasSelection: false, pasteAllowed: false })).toEqual(['copy!', 'paste!']);
  });
});
