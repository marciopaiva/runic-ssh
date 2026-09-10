/**
 * The terminal window's menu on the map (#115): what it offers per state.
 */

import { describe, expect, it } from 'vitest';

import { terminalMenu } from '../src/features/map';

const ids = (state: Parameters<typeof terminalMenu>[0]): readonly string[] =>
  terminalMenu(state).map((entry) => `${entry.id}${entry.disabled ? '!' : ''}`);

describe('the terminal window menu', () => {
  it('always offers copy and paste, copy taken only with a selection', () => {
    expect(ids({ hasSelection: false, reachable: false, broadcast: null })).toEqual(['copy!', 'paste']);
    expect(ids({ hasSelection: true, reachable: false, broadcast: null })).toEqual(['copy', 'paste']);
  });

  it('offers a line only when another terminal exists to reach', () => {
    expect(ids({ hasSelection: false, reachable: true, broadcast: null })).toEqual(['copy!', 'paste', 'broadcast']);
  });

  it('offers to spare or include the window only on an armed set', () => {
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'receiving' })).toContain('mute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'armed' })).toContain('mute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: 'muted' })).toContain('unmute');
    expect(ids({ hasSelection: false, reachable: true, broadcast: null })).not.toContain('mute');
  });

  it('never offers a split: a map window has no panes', () => {
    for (const entry of terminalMenu({ hasSelection: true, reachable: true, broadcast: 'receiving' })) {
      expect(entry.id).not.toMatch(/split|pane/);
    }
  });
});
