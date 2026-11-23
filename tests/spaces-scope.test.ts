/**
 * Guards which Space a host is in and what the keyboard does about it.
 *
 * The rule that matters is the fallback: a host with no Space, or one whose
 * Space has been deleted, is in the default Space. That is what lets a Space be
 * deleted without sweeping through the hosts file.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SPACE,
  inSpace,
  resolveActive,
  spaceAtPosition,
  spaceOf,
  spacePosition,
} from '../src/features/spaces/scope';
import type { Space } from '../src/ipc';

const spaces: readonly Space[] = [
  { id: 'prod', name: 'Production', weight: 'production' },
  { id: 'lab', name: 'Lab', weight: 'normal' },
];

const key = (code: string, extra: Partial<KeyboardEvent> = {}) => ({
  type: 'keydown',
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

describe('which Space a host is in', () => {
  it('is its own when that Space is saved', () => {
    expect(spaceOf({ space: 'prod' }, spaces)).toBe('prod');
  });

  it('is the default when it names none, or an empty one', () => {
    expect(spaceOf({}, spaces)).toBe(DEFAULT_SPACE);
    expect(spaceOf({ space: '' }, spaces)).toBe(DEFAULT_SPACE);
  });

  it('is the default when the Space it named was deleted', () => {
    expect(spaceOf({ space: 'gone' }, spaces)).toBe(DEFAULT_SPACE);
  });

  it('lists the hosts of one Space and keeps the others saved', () => {
    const hosts = [
      { session: { space: 'prod' } },
      { session: { space: 'lab' } },
      { session: {} },
      { session: { space: 'gone' } },
    ];
    expect(inSpace(hosts, 'prod', spaces)).toHaveLength(1);
    expect(inSpace(hosts, DEFAULT_SPACE, spaces)).toHaveLength(2);
    expect(inSpace(hosts, 'lab', spaces)).toHaveLength(1);
  });

  it('puts a deleted active Space back on the default', () => {
    expect(resolveActive('prod', spaces)).toBe('prod');
    expect(resolveActive('gone', spaces)).toBe(DEFAULT_SPACE);
    expect(resolveActive('', spaces)).toBe(DEFAULT_SPACE);
  });
});

describe('the keyboard', () => {
  it('maps a position to a Space, 1 being the default', () => {
    expect(spaceAtPosition(1, spaces)).toBe(DEFAULT_SPACE);
    expect(spaceAtPosition(2, spaces)).toBe('prod');
    expect(spaceAtPosition(3, spaces)).toBe('lab');
    expect(spaceAtPosition(4, spaces)).toBeUndefined();
    expect(spaceAtPosition(2, [])).toBeUndefined();
  });

  it('reads Ctrl+1 to 9, and Cmd+1 to 9 on a Mac', () => {
    expect(spacePosition(key('Digit3', { ctrlKey: true }), false)).toBe(3);
    expect(spacePosition(key('Digit9', { ctrlKey: true }), false)).toBe(9);
    expect(spacePosition(key('Digit2', { metaKey: true }), true)).toBe(2);
  });

  it('ignores everything else', () => {
    expect(spacePosition(key('Digit0', { ctrlKey: true }), false)).toBeNull();
    expect(spacePosition(key('Digit1'), false)).toBeNull();
    expect(spacePosition(key('Digit1', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(spacePosition(key('Digit1', { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(spacePosition(key('Digit1', { metaKey: true }), false)).toBeNull();
    expect(spacePosition(key('Digit1', { ctrlKey: true }), true)).toBeNull();
    expect(spacePosition({ ...key('Digit1', { ctrlKey: true }), type: 'keyup' }, false)).toBeNull();
  });
});
