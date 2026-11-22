import { describe, expect, it } from 'vitest';

import { differingLines, groupResults, hasReference, visibleText } from '../src/features/fleet/group';
import type { FleetResult } from '../src/ipc/fleet';
import type { SessionHandle } from '../src/ipc/sessions';

const handle = (n: number): SessionHandle => n as unknown as SessionHandle;

function ran(n: number, stdout: string, overrides: Partial<{ stderr: string; exitStatus: number | null; truncated: boolean; timedOut: boolean }> = {}): FleetResult {
  return {
    handle: handle(n),
    state: 'ran',
    stdout,
    stderr: overrides.stderr ?? '',
    exitStatus: overrides.exitStatus ?? 0,
    truncated: overrides.truncated ?? false,
    timedOut: overrides.timedOut ?? false,
  };
}

describe('groupResults', () => {
  it('puts identical answers together and the largest group first', () => {
    const grouping = groupResults([
      ran(1, 'a'),
      ran(2, 'b'),
      ran(3, 'a'),
      ran(4, 'a'),
    ]);

    expect(grouping.groups.map((g) => g.handles)).toEqual([[1, 3, 4], [2]]);
  });

  it('does not merge answers that differ only in stderr, exit status or a flag', () => {
    const grouping = groupResults([
      ran(1, 'x'),
      ran(2, 'x', { stderr: 'oops' }),
      ran(3, 'x', { exitStatus: 1 }),
      ran(4, 'x', { truncated: true }),
      ran(5, 'x', { timedOut: true }),
    ]);

    expect(grouping.groups).toHaveLength(5);
  });

  it('keeps hosts that gave nothing apart from the comparison', () => {
    const grouping = groupResults([ran(1, 'a'), { handle: handle(2), state: 'failed' }]);

    expect(grouping.groups).toHaveLength(1);
    expect(grouping.failed).toEqual([2]);
  });

  it('keeps the order the hosts were asked in when groups are the same size', () => {
    const grouping = groupResults([ran(1, 'a'), ran(2, 'b')]);

    expect(grouping.groups.map((g) => g.stdout)).toEqual(['a', 'b']);
  });
});

describe('visibleText', () => {
  it('shows an escape sequence instead of carrying it', () => {
    expect(visibleText('a\u001b[31mb')).toBe('a\\x1b[31mb');
  });

  it('keeps newlines and tabs', () => {
    expect(visibleText('a\n\tb')).toBe('a\n\tb');
  });
});

describe('differingLines', () => {
  it('marks only the lines that differ from the reference', () => {
    expect([...differingLines('a\nB\nc', 'a\nb\nc')]).toEqual([1]);
  });

  it('marks lines the reference does not have', () => {
    expect([...differingLines('a\nb', 'a')]).toEqual([1]);
  });
});

describe('differingLines as a real diff', () => {
  it('marks an inserted line and not every line after it', () => {
    expect([...differingLines('a\nNEW\nb\nc', 'a\nb\nc')]).toEqual([1]);
  });

  it('marks a replaced line once', () => {
    expect([...differingLines('a\nX\nc', 'a\nb\nc')]).toEqual([1]);
  });

  it('marks nothing for identical text and every line of an unrelated one', () => {
    expect([...differingLines('a\nb', 'a\nb')]).toEqual([]);
    expect([...differingLines('x\ny', 'a\nb')]).toEqual([0, 1]);
  });

  it('falls back to comparing by index when the tables would be huge', () => {
    const big = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join('\n');

    expect([...differingLines(`${big}\nextra`, big)]).toEqual([2500]);
  });
});

describe('hasReference', () => {
  const group = (count: number) =>
    ({ stdout: '', stderr: '', exitStatus: 0, truncated: false, timedOut: false, handles: Array.from({ length: count }, (_, i) => i as never) }) as never;

  it('needs a group strictly larger than the next, or only one', () => {
    expect(hasReference([group(3), group(1)])).toBe(true);
    expect(hasReference([group(2)])).toBe(true);
    expect(hasReference([group(1), group(1)])).toBe(false);
    expect(hasReference([])).toBe(false);
  });
});
