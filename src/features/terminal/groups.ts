/**
 * How the main area is divided, and where a keystroke goes.
 *
 * ADR-0020 replaced the model this sits beside. A layout used to be slots
 * holding at most one session each, with a tab strip above the whole window
 * naming every session and a header on each pane naming one. Two mechanisms
 * answered the same question and nothing failed when they disagreed.
 *
 * A group answers it once. It is a list of open things and an index saying
 * which of them is showing, so the strip is the header and a rectangle has one
 * name. Six sessions in four rectangles becomes expressible, which slots could
 * not do and which is the ordinary shape of watching a pool.
 *
 * What a group holds is a `Focus`, not a session id. That union already
 * covered a session, a host form and the settings surface before this file
 * existed, which is why rule 3 of ADR-0020 costs nothing here: everything
 * opened is a tab because everything opened was already a `Focus`.
 *
 * Pure, for the reason `mounted.ts` and `focus.ts` are: what goes wrong is a
 * session drawn in the wrong rectangle, a keystroke reaching a host nobody
 * armed, or two terminals sharing one box, and none of it is visible until
 * somebody is looking at four hosts at once.
 */

import { sameFocus } from '../chrome/focus';
import type { Focus } from '../chrome/focus';
import type { Session } from '../../ipc';

/**
 * Every shape the main area can be divided into, in the order they divide it
 * further, as columns by rows.
 *
 * Named for their dimensions rather than for what they look like, which the
 * first four were: `columns` meant two of them and stopped being a usable name
 * the moment there were three. A set this size wants a scheme that scales, and
 * it is the one the arithmetic in ADR-0022 is written in.
 *
 * This list is the source and the type is derived from it, so a shape added
 * here is a shape every caller sees. The one that matters is the test that
 * walks it: a hand written list there covered four shapes and would have gone
 * on covering four.
 */
export const GRIDS = ['1x1', '2x1', '1x2', '3x1', '2x2', '3x2', '2x3', '3x3'] as const;

export type Grid = (typeof GRIDS)[number];

/** A rectangle inside the main area, in percentages of it. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** What the shell stores: which entries live in a group, and which is showing. */
export interface HeldGroup {
  readonly entries: readonly Focus[];
  /** Index into `entries`. `-1` only when the group is empty. */
  readonly activeAt: number;
}

/** A group as it should be drawn. */
export interface Group extends HeldGroup {
  readonly box: Box;
}

/** Every shape, as equal cells filled left to right and then downward. */
function cells(columns: number, rows: number): readonly Box[] {
  const width = 100 / columns;
  const height = 100 / rows;

  return Array.from({ length: columns * rows }, (_, at) => ({
    left: (at % columns) * width,
    top: Math.floor(at / columns) * height,
    width,
    height,
  }));
}

const BOXES: Readonly<Record<Grid, readonly Box[]>> = {
  '1x1': cells(1, 1),
  '2x1': cells(2, 1),
  '1x2': cells(1, 2),
  '3x1': cells(3, 1),
  '2x2': cells(2, 2),
  '3x2': cells(3, 2),
  '2x3': cells(2, 3),
  '3x3': cells(3, 3),
};

/**
 * The whole area, which is where a terminal nobody is looking at still sits.
 *
 * ADR-0014 keeps every terminal mounted and hides the ones not showing with
 * `visibility`. A hidden terminal still has to measure something real, because
 * an element with `display: none` measures zero and tells the pty `0x0`.
 */
export const WHOLE_AREA: Box = { left: 0, top: 0, width: 100, height: 100 };

export function gridBoxes(grid: Grid): readonly Box[] {
  return BOXES[grid];
}

export function gridCount(grid: Grid): number {
  return BOXES[grid].length;
}

/** The entry a group is showing, or `null` when it is empty. */
export function activeEntry(group: HeldGroup): Focus | null {
  return group.entries[group.activeAt] ?? null;
}

/** Which group holds an entry, or `-1`. */
export function groupOf(groups: readonly HeldGroup[], focus: Focus | null): number {
  if (focus === null) return -1;
  return groups.findIndex((group) => group.entries.some((entry) => sameFocus(entry, focus)));
}

/**
 * The groups as they should be drawn, given what is still open.
 *
 * The parallel of `resolveFocus`, and for the same reason: a session leaves the
 * strip on its own when its host hangs up, so a group pointing at one has to be
 * emptied while rendering rather than by whoever noticed.
 *
 * Three invariants come out of here.
 *
 * No entry appears in two groups, because two React children with one key is
 * one xterm silently reusing another's.
 *
 * Everything open has a home, so nothing can be running with no rectangle to be
 * seen in. An entry no group claims joins the one holding the focus, which is
 * where a person expects a newly opened thing to appear.
 *
 * And the focused entry is the active tab of its group, because a strip
 * highlighting something the area is not showing is worse than no split at all.
 */
export function resolveGroups(
  grid: Grid,
  held: readonly HeldGroup[],
  entries: readonly Focus[],
  focus: Focus | null,
): readonly Group[] {
  const boxes = gridBoxes(grid);
  const open = (candidate: Focus): boolean =>
    entries.some((entry) => sameFocus(entry, candidate));

  const taken: Focus[] = [];
  const claim = (candidate: Focus): boolean => {
    if (!open(candidate) || taken.some((entry) => sameFocus(entry, candidate))) return false;
    taken.push(candidate);
    return true;
  };

  const kept: Focus[][] = boxes.map((_, at) => (held[at]?.entries ?? []).filter(claim));

  /* Anything open that no group claimed. It joins the group holding the focus,
     falling back to the first, which is also what happens when the focus is
     itself the orphan. */
  const orphans = entries.filter(
    (entry) => !taken.some((held_) => sameFocus(held_, entry)),
  );
  if (orphans.length > 0) {
    const home = Math.max(
      0,
      kept.findIndex((group) => group.some((entry) => sameFocus(entry, focus))),
    );
    kept[home]?.push(...orphans);
  }

  return boxes.map((box, at) => {
    const groupEntries = kept[at] ?? [];
    const focusedAt = groupEntries.findIndex((entry) => sameFocus(entry, focus));

    /* The previously active entry, if it is still here. Falling back to the
       first keeps a group showing something after the one it showed closed. */
    const wanted = held[at]?.activeAt ?? 0;
    const previous = held[at]?.entries[wanted];
    const previousAt =
      previous === undefined
        ? -1
        : groupEntries.findIndex((entry) => sameFocus(entry, previous));

    let activeAt = focusedAt;
    if (activeAt < 0) activeAt = previousAt;
    if (activeAt < 0 && groupEntries.length > 0) activeAt = 0;
    if (groupEntries.length === 0) activeAt = -1;

    return { entries: groupEntries, activeAt, box };
  });
}

/**
 * What picking something does to the groups.
 *
 * Already on screen: nothing moves and only the focus travels. Rearranging
 * rectangles under somebody reaching for a terminal they can already see is the
 * sort of thing that makes a split feel unpredictable.
 *
 * Otherwise it joins the focused group, as a tab, and becomes the active one.
 * It does not push anything out: a group holds a list, so the thing that used
 * to be showing is still there, one click away. That is the difference from the
 * model this replaces, where filling a rectangle meant evicting whatever held
 * it.
 */
export function placeEntry(
  held: readonly HeldGroup[],
  focusedGroup: number,
  entry: Focus,
): readonly HeldGroup[] {
  if (held.some((group) => group.entries.some((held_) => sameFocus(held_, entry)))) return held;

  const target = focusedGroup >= 0 && focusedGroup < held.length ? focusedGroup : 0;
  if (held.length === 0) return held;

  return held.map((group, at) => {
    if (at !== target) return group;
    const entries = [...group.entries, entry];
    return { entries, activeAt: entries.length - 1 };
  });
}

/**
 * Takes an entry out of whichever group held it.
 *
 * `resolveGroups` already refuses to draw an entry that is no longer open, so
 * this is not about what is on screen. It is about what is remembered. A
 * closed tab left behind keeps its place, and reopening the same host form
 * puts it back in a rectangle nobody is looking at rather than in the one
 * being worked in, which reads as the window deciding on its own.
 *
 * A session that drops on its own is not closed by anybody and does not come
 * through here. That one keeps its place on purpose: reconnecting puts it back
 * where it was.
 */
export function removeEntry(
  held: readonly HeldGroup[],
  entry: Focus,
): readonly HeldGroup[] {
  return held.map((group) => {
    const at = group.entries.findIndex((candidate) => sameFocus(candidate, entry));
    if (at < 0) return group;

    const entries = group.entries.filter((_, index) => index !== at);
    if (entries.length === 0) return { entries, activeAt: -1 };

    /* The group goes on showing what it was showing. Unless that was the one
       leaving: then the neighbour to the right, falling back to the left,
       which is the rule the strip has followed since there was one. */
    if (group.activeAt === at) return { entries, activeAt: Math.min(at, entries.length - 1) };

    return { entries, activeAt: group.activeAt > at ? group.activeAt - 1 : group.activeAt };
  });
}

/**
 * Moves an entry to a group, wherever it was.
 *
 * The other half of `placeEntry`, which deliberately refuses to move anything
 * a group already holds: clicking a tab you can already see must not rearrange
 * the rectangles under you. Somebody asking for the move by name is the case
 * that rule was protecting against guessing at, so it gets its own function
 * rather than a flag on that one.
 *
 * It lands at the end and becomes what its new group is showing, because a
 * move nobody can see happen is indistinguishable from one that did not work.
 */
export function moveEntry(
  held: readonly HeldGroup[],
  entry: Focus,
  toGroup: number,
): readonly HeldGroup[] {
  if (toGroup < 0 || toGroup >= held.length) return held;
  if (held[toGroup]?.entries.some((candidate) => sameFocus(candidate, entry)) === true) return held;

  const without = removeEntry(held, entry);

  return without.map((group, at) => {
    if (at !== toGroup) return group;
    const entries = [...group.entries, entry];
    return { entries, activeAt: entries.length - 1 };
  });
}

/**
 * The sessions a keystroke would reach if the switch were armed.
 *
 * The active entry of each group, less the ones turned off in their own strip,
 * and only the ones that are sessions: a host form has no host to type into.
 *
 * A session sitting behind another in the same group is connected and is not
 * receiving. That is the rule ADR-0020 introduced and the one most likely to be
 * got wrong, so it falls out of the shape here rather than being checked
 * somewhere else: a group contributes what it is showing, and nothing else.
 */
export function receivingSessions(
  groups: readonly HeldGroup[],
  muted: ReadonlySet<string>,
): readonly string[] {
  const out: string[] = [];

  for (const group of groups) {
    const entry = activeEntry(group);
    if (entry === null || entry.kind !== 'session') continue;
    if (muted.has(entry.sessionId)) continue;
    out.push(entry.sessionId);
  }

  return out;
}

/**
 * The connected sessions a keystroke does not reach.
 *
 * The second question the sidebar answers, and the one the group model made
 * worth asking. There are three ways to be here and only one of them is
 * visible from the main area: turned off in a strip, sitting behind another
 * tab in the same group, or open in no group at all. The middle one is the
 * rule ADR-0020 introduced and named as the most likely to be got wrong, so
 * the list of who is *not* receiving is drawn rather than inferred.
 *
 * `connected` means a session with a channel open. One still being made cannot
 * receive anything and is not being spared from it.
 */
export function sparedSessions(
  connected: readonly string[],
  receiving: readonly string[],
): readonly string[] {
  const reached = new Set(receiving);

  return connected.filter((sessionId) => !reached.has(sessionId));
}

/**
 * Which sessions a keystroke reaches.
 *
 * `from` is the session whose terminal produced the bytes, not whichever the
 * shell believes is focused. The two agree in practice and the cost of them
 * disagreeing for one render is a keystroke sent to the wrong host, so the
 * question is asked of the terminal that actually has the keyboard.
 *
 * A terminal that is not receiving reaches only itself. That now covers three
 * cases rather than two: a group turned off in its strip, a session in no group
 * at all, and a session sitting in a group's background. None of them should be
 * able to send anywhere else. The whole point of this switch is that the blast
 * radius is larger than one host, and "cannot happen" is not a good enough
 * reason to widen it.
 *
 * One receiving session is not a broadcast. Left as one it would send exactly
 * where an unarmed keystroke goes while the screen claimed something was
 * happening, so it is treated as off.
 */
export function inputTargets(
  groups: readonly HeldGroup[],
  from: string,
  sync: boolean,
  muted: ReadonlySet<string>,
): readonly string[] {
  if (!sync) return [from];

  const receiving = receivingSessions(groups, muted);
  if (receiving.length < 2 || !receiving.includes(from)) return [from];

  return receiving;
}

/** What a group's tab says it is. */
export interface GroupLabel {
  readonly name: string;
  readonly where: string;
}

/**
 * How a tab names its session.
 *
 * With one group the strip answers this on its own. With four, the shell
 * prompt is otherwise the only thing on screen saying which host a rectangle
 * belongs to, and a prompt says whatever the remote end put in `PS1`. That is
 * a bad thing to be reading a moment before running one command on all of
 * them.
 *
 * The port is left off when it is 22. It is on every row otherwise and carries
 * no information; showing it would push the part that does identify the host
 * along by three characters everywhere.
 */
export function groupLabel(session: Session): GroupLabel {
  const port = session.port === 22 ? '' : `:${String(session.port)}`;

  return { name: session.name, where: `${session.user}@${session.host}${port}` };
}
