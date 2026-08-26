/**
 * What the window says out loud about synchronised typing.
 *
 * Every other marker for this state is visual, and the one that carried
 * `role="status"` was mounted and unmounted with the state itself: a live
 * region that arrives already holding its text is not reliably announced, and
 * one that is removed announces nothing. So arming was told to nobody and
 * disarming was told to nobody, on the control whose blast radius is larger
 * than the host being looked at (#154).
 *
 * The decision is a function of two counts so it can be held here. Whether a
 * screen reader speaks it is not something this repository can assert, and
 * `docs/testing.md` carries that half.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { announceBroadcast } from '../src/features/status/broadcast';

describe('announcing synchronised typing', () => {
  it('says nothing on the first render', () => {
    /* A window that announces its resting state on open teaches people to
       ignore the region that will later carry something. */
    expect(announceBroadcast(null, null)).toBeNull();
  });

  it('announces arming, with the count', () => {
    expect(announceBroadcast(null, 4)).toEqual({
      key: 'status.sync.announce.other',
      count: 4,
    });
  });

  it('announces disarming, which no marker used to do', () => {
    expect(announceBroadcast(4, null)).toEqual({
      key: 'status.sync.announce.off',
      count: 0,
    });
  });

  it('announces a group being spared, because the reach changed', () => {
    expect(announceBroadcast(4, 3)).toEqual({
      key: 'status.sync.announce.other',
      count: 3,
    });
  });

  it('has a singular for the last one still receiving', () => {
    expect(announceBroadcast(2, 1)).toEqual({
      key: 'status.sync.announce.one',
      count: 1,
    });
  });

  it('repeats nothing when the count did not move', () => {
    expect(announceBroadcast(3, 3)).toBeNull();
  });
});

describe('the region that carries it', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/components/StatusBar.tsx', import.meta.url)),
    'utf8',
  );

  it('is rendered unconditionally by the status bar', () => {
    /* The defect was the conditional, not the role. This asserts the region is
       a child of the bar rather than something rendered beside the badge, by
       holding the one line that would have to move for it to become a
       condition again. */
    expect(source).toContain('<p role="status" aria-live="polite" className="sr-only">');
  });

  it('is the only live region on the bar', () => {
    /* Two of them announce the same fact twice. */
    expect(source.match(/role="status"/g)).toHaveLength(1);
  });
});
