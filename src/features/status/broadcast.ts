/**
 * What the window says out loud when synchronised typing is armed or disarmed.
 *
 * Every marker this state carries is visual: the whole top edge of the status
 * bar turns warn, each receiving group takes a border and a switch, and the
 * sidebar labels the held-out hosts `SPARED`. Somebody driving with a screen
 * reader arms the broadcast from the palette and is told none of it, on the one
 * control whose blast radius is larger than the host being looked at (#154).
 *
 * The badge on the bar carried `role="status"` and did not close this. A live
 * region that arrives already holding its text is not reliably announced, and
 * that badge is inserted and removed with the fact it describes, so disarming
 * said nothing at all. The region has to outlive the state, which is what makes
 * this a string the bar always renders rather than an element it sometimes
 * mounts.
 *
 * A function over the two counts rather than an effect, so the decision can be
 * asserted without a DOM to render into.
 */

/** The message to announce, as a key and the number that fills it. */
export interface Announcement {
  readonly key: 'status.sync.announce.one' | 'status.sync.announce.other' | 'status.sync.announce.off';
  readonly count: number;
}

/**
 * What changed, or `null` when nothing did.
 *
 * `null` means the broadcast is off; a number is how many hosts are receiving.
 * A narrowing counts: sparing a group changes how far a keystroke travels, and
 * that is the fact the region exists to carry. The first render compares `null`
 * with `null` and therefore says nothing, which is deliberate. A window that
 * announces its resting state on open teaches people to ignore it.
 */
export function announceBroadcast(before: number | null, now: number | null): Announcement | null {
  if (before === now) return null;

  if (now === null) return { key: 'status.sync.announce.off', count: 0 };

  return {
    key: now === 1 ? 'status.sync.announce.one' : 'status.sync.announce.other',
    count: now,
  };
}
