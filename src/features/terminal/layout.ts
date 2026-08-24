/**
 * How the panel is divided, and where a keystroke goes.
 *
 * ADR-0015 put every session surface in that session's panel and had one panel
 * on screen at a time. A split has several, so "the panel" becomes "the pane"
 * and something has to say which session is in which rectangle. That is all
 * this file does.
 *
 * Pure, for the same reason `mounted.ts` and `focus.ts` are: what goes wrong
 * here is a session drawn in the wrong rectangle, or two terminals sharing one,
 * and neither is visible until somebody is looking at four hosts at once.
 *
 * Fixed shapes rather than a tree of splits. A tree is what a tmux user
 * expects and it was rejected on price, not on doubt: directional movement,
 * collapsing a node on close and serialising the whole thing are the most
 * expensive machinery in this repository, against a project whose argument is
 * being small. ADR-0019 records that, so the next person weighing it starts
 * from the reason rather than the absence.
 */

import type { Tab } from '../chrome/tabs';
import type { Session } from '../../ipc';

export type LayoutKind = 'single' | 'columns' | 'rows' | 'grid';

/** A rectangle inside the panel, in percentages of it. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Pane {
  /** `null` is a slot with nothing in it yet, waiting for a tab to be picked. */
  readonly sessionId: string | null;
  readonly box: Box;
}

const BOXES: Readonly<Record<LayoutKind, readonly Box[]>> = {
  single: [{ left: 0, top: 0, width: 100, height: 100 }],
  columns: [
    { left: 0, top: 0, width: 50, height: 100 },
    { left: 50, top: 0, width: 50, height: 100 },
  ],
  rows: [
    { left: 0, top: 0, width: 100, height: 50 },
    { left: 0, top: 50, width: 100, height: 50 },
  ],
  grid: [
    { left: 0, top: 0, width: 50, height: 50 },
    { left: 50, top: 0, width: 50, height: 50 },
    { left: 0, top: 50, width: 50, height: 50 },
    { left: 50, top: 50, width: 50, height: 50 },
  ],
};

/** The whole panel, which is where a terminal nobody is looking at still sits. */
export const WHOLE_PANEL: Box = { left: 0, top: 0, width: 100, height: 100 };

export function paneBoxes(kind: LayoutKind): readonly Box[] {
  return BOXES[kind];
}

export function paneCount(kind: LayoutKind): number {
  return BOXES[kind].length;
}

/**
 * The panes as they should be drawn, given what is still open.
 *
 * The parallel of `resolveFocus`, and for the same reason: a session leaves the
 * strip on its own when the host drops the connection, so a slot pointing at
 * one has to be emptied while rendering rather than by whoever noticed.
 *
 * Two invariants come out of here. No session appears twice, because two panes
 * on one session id would be two React children with one key, which is one
 * xterm silently reusing the other's. And the focused session is always on
 * screen, because a tab strip that highlights something the panel is not
 * showing is worse than no split at all.
 */
export function resolveLayout(
  kind: LayoutKind,
  slots: readonly (string | null)[],
  tabs: readonly Tab[],
  focused: string | null,
): readonly Pane[] {
  const boxes = paneBoxes(kind);
  const open = new Set(tabs.map((tab) => tab.sessionId));

  const taken = new Set<string>();
  const placed: (string | null)[] = boxes.map((_, at) => {
    const wanted = slots[at] ?? null;
    if (wanted === null || !open.has(wanted) || taken.has(wanted)) return null;
    taken.add(wanted);
    return wanted;
  });

  if (focused !== null && open.has(focused) && !taken.has(focused)) {
    /* The first free slot, so a session that closed leaves its rectangle to
       whatever the strip moved on to, rather than pushing a neighbour out. */
    const free = placed.indexOf(null);
    placed[free < 0 ? 0 : free] = focused;
  }

  return boxes.map((box, at) => ({ sessionId: placed[at] ?? null, box }));
}

/**
 * What clicking a tab does to the panes.
 *
 * Already on screen: nothing moves and only the focus travels. Rearranging
 * panes under someone who was reaching for a terminal they can already see is
 * the sort of thing that makes a split feel unpredictable.
 *
 * Otherwise it fills an empty pane if there is one, and replaces the focused
 * pane if there is not. The empty pane comes first because it cannot be
 * focused: focus points at a session, an empty pane has none, and without this
 * an empty pane would be a rectangle asking to be filled with no way to do it.
 */
export function placeSession(
  slots: readonly (string | null)[],
  focusedAt: number,
  sessionId: string,
): readonly (string | null)[] {
  if (slots.includes(sessionId)) return slots;

  const free = slots.indexOf(null);
  const target = free >= 0 ? free : focusedAt;
  if (target < 0 || target >= slots.length) return slots;

  return slots.map((held, at) => (at === target ? sessionId : held));
}

/**
 * The panes a keystroke would reach if the switch were armed.
 *
 * Every pane with a session in it, less the ones turned off in their own
 * header. Excluding a host is the ordinary case rather than an exotic one:
 * three of four machines in a pool, with the database left out. Without it the
 * only way to spare that host is to drop it from the split, so the rigid rule
 * pushes people to arm all four when they wanted three, which is the more
 * dangerous of the two.
 */
export function syncedPanes(
  panes: readonly Pane[],
  muted: ReadonlySet<string>,
): readonly string[] {
  return panes
    .map((pane) => pane.sessionId)
    .filter((sessionId): sessionId is string => sessionId !== null && !muted.has(sessionId));
}

/**
 * Which sessions a keystroke reaches.
 *
 * `from` is the session whose terminal produced the bytes, not whichever the
 * shell believes is focused. The two agree in practice and the cost of them
 * disagreeing for one render is a keystroke sent to the wrong host, so the
 * question is asked of the terminal that actually has the keyboard.
 *
 * A terminal that is not receiving reaches only itself. That covers a pane
 * turned off in its header and a terminal in no pane at all: neither should be
 * able to send anywhere else, and the second should not be able to receive a
 * keystroke in the first place. The whole point of this switch is that the
 * blast radius is larger than one host, and "cannot happen" is not a good
 * enough reason to widen it.
 *
 * One receiving pane is not a broadcast. Left as one it would send exactly
 * where an unarmed keystroke goes while the screen claimed something was
 * happening, so it is treated as off.
 */
export function inputTargets(
  panes: readonly Pane[],
  from: string,
  sync: boolean,
  muted: ReadonlySet<string>,
): readonly string[] {
  if (!sync) return [from];

  const receiving = syncedPanes(panes, muted);
  if (receiving.length < 2 || !receiving.includes(from)) return [from];

  return receiving;
}

/** What a pane says it is. */
export interface PaneLabel {
  readonly name: string;
  readonly where: string;
}

/**
 * How a pane names its session.
 *
 * With one terminal the tab strip answers this and the panel needs no label.
 * With four, the shell prompt is the only thing on screen saying which host a
 * rectangle belongs to, and a prompt says whatever the remote host decided to
 * put in `PS1`. That is a bad thing to be reading a moment before running the
 * same command on all of them.
 *
 * The port is left off when it is 22. It is on every row otherwise and carries
 * no information; showing it would push the part that does identify the host
 * along by three characters on every pane.
 */
export function paneLabel(session: Session): PaneLabel {
  const port = session.port === 22 ? '' : `:${String(session.port)}`;

  return { name: session.name, where: `${session.user}@${session.host}${port}` };
}
