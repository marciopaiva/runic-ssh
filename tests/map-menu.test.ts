/**
 * The terminal window's menu on the map (#115): what it offers per state.
 */

import { describe, expect, it } from 'vitest';

import { terminalMenu } from '../src/features/map';

const ids = (state: Parameters<typeof terminalMenu>[0]): readonly string[] =>
  terminalMenu(state).map((entry) => `${entry.id}${entry.disabled ? '!' : ''}`);

describe('the terminal window menu', () => {
  it('always offers copy and paste, copy taken only with a selection', () => {
    expect(ids({ hasSelection: false, reachable: false, broadcast: null, pasteAllowed: true })).toEqual(['copy!', 'paste']);
    expect(ids({ hasSelection: true, reachable: false, broadcast: null, pasteAllowed: true })).toEqual(['copy', 'paste']);
  });

  it('offers a line only when another terminal exists to reach', () => {
    expect(ids({ hasSelection: false, reachable: true, broadcast: null, pasteAllowed: true })).toEqual([
      'copy!',
      'paste',
      'broadcast',
    ]);
  });

  it('offers to spare or include the window only on an armed set', () => {
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'receiving', pasteAllowed: true })).toContain('mute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'armed', pasteAllowed: true })).toContain('mute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'muted', pasteAllowed: true })).toContain('unmute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: null, pasteAllowed: true })).not.toContain('mute');
  });

  it('takes paste where a scripted paste cannot work, keeping the entry', () => {
    expect(ids({ hasSelection: false, reachable: false, broadcast: null, pasteAllowed: false })).toEqual(['copy!', 'paste!']);
  });

  it('never offers a split: a map window has no panes', () => {
    for (const entry of terminalMenu({ hasSelection: true, reachable: true, broadcast: 'receiving', pasteAllowed: true })) {
      expect(entry.id).not.toMatch(/split|pane/);
    }
  });
});
