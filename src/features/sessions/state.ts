/**
 * What a session looks like right now.
 *
 * The rule this file exists for: **state is never carried by colour alone**.
 * Roughly one man in twelve cannot separate the red from the green, a terminal
 * is a thing people use in bright sunlight and at two in the morning, and a
 * screenshot pasted into a ticket is often greyscale. So every state differs by
 * *shape* first — filled, outlined, or a glyph — and the colour is a second
 * signal on top of a distinction that already works without it.
 */

import type { Session, SessionHandle } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';
import { orderChain } from './jump';

export type ConnectionKind =
  | 'connected'
  | 'connecting'
  /** Not open itself, but a session behind it is riding it. See `carried.ts`. */
  | 'carrying'
  | 'saved'
  | 'keyMismatch'
  | 'unreachable';

/** How the marker is drawn. Distinct per state, before any colour is applied. */
export type MarkerShape =
  | 'filled'
  | 'outlined'
  | 'halo'
  | 'passing'
  | 'warning'
  | 'crossed';

export interface ConnectionState {
  readonly kind: ConnectionKind;
  /** What distinguishes it with the colour removed. */
  readonly shape: MarkerShape;
  /** The token class for the colour, which is the *second* signal. */
  readonly tone: string;
  /**
   * Read aloud, and shown on hover.
   *
   * Parameterless by type: the label is chosen at runtime, and a message that
   * needed a parameter would render `{something}` to a user with no call site
   * to catch it.
   */
  readonly label: ParameterlessKey;
}

const STATES: Readonly<Record<ConnectionKind, ConnectionState>> = {
  connected: {
    kind: 'connected',
    shape: 'filled',
    tone: 'text-ok',
    label: 'session.state.connected',
  },
  connecting: {
    kind: 'connecting',
    shape: 'halo',
    tone: 'text-warn',
    label: 'session.state.connecting',
  },
  /* A bastion with no tab, carrying somebody else's session. The connection
     to it is open and authenticated, which is why this is not `saved`: a host
     the application is logged in to must not be drawn as one it has never
     touched. #168. */
  carrying: {
    kind: 'carrying',
    shape: 'passing',
    tone: 'text-accent',
    label: 'session.state.carrying',
  },
  saved: {
    kind: 'saved',
    shape: 'outlined',
    tone: 'text-ink-disabled',
    label: 'session.state.saved',
  },
  keyMismatch: {
    kind: 'keyMismatch',
    shape: 'warning',
    tone: 'text-danger',
    label: 'session.state.keyMismatch',
  },
  unreachable: {
    kind: 'unreachable',
    shape: 'crossed',
    tone: 'text-ink-faint',
    label: 'session.state.unreachable',
  },
};

export function describeState(kind: ConnectionKind): ConnectionState {
  return STATES[kind];
}

export const ALL_STATES: readonly ConnectionState[] = Object.values(STATES);

/** What the sidebar knows about a session beyond what is saved on disk. */
export interface LiveSession {
  readonly session: Session;
  readonly handle: SessionHandle | null;
  readonly kind: ConnectionKind;
}

/** A heading and the sessions under it, in the order the file lists them. */
export interface SessionGroup {
  /** `null` for sessions with no group of their own. */
  readonly name: string | null;
  readonly sessions: readonly LiveSession[];
}

/**
 * Groups sessions for display.
 *
 * Groups keep the order in which they first appear rather than being sorted:
 * the file is the user's arrangement, and re-ordering it under them is the
 * kind of helpfulness nobody asked for. Ungrouped sessions go last, because a
 * heading-less run in the middle reads as a rendering bug.
 */
export function groupSessions(sessions: readonly LiveSession[]): readonly SessionGroup[] {
  const named = new Map<string, LiveSession[]>();
  const ungrouped: LiveSession[] = [];

  for (const live of sessions) {
    const group = live.session.group;
    if (group === null || group === undefined || group.trim() === '') {
      ungrouped.push(live);
      continue;
    }

    const existing = named.get(group);
    if (existing === undefined) {
      named.set(group, [live]);
    } else {
      existing.push(live);
    }
  }

  const groups: SessionGroup[] = [...named.entries()].map(([name, items]) => ({
    name,
    sessions: items,
  }));

  if (ungrouped.length > 0) {
    groups.push({ name: null, sessions: ungrouped });
  }

  return groups;
}

/**
 * The key one group is known by, on screen and in `solo` below.
 *
 * The one string a heading-less run of sessions has to answer to, so a
 * React `key` and a click target agree on what "this group" means without
 * each inventing its own placeholder for the same `null`.
 */
export const UNGROUPED_KEY = 'ungrouped';

export function groupKey(group: SessionGroup): string {
  return group.name ?? UNGROUPED_KEY;
}

/**
 * Which sessions still answer a name search.
 *
 * By name alone, on the maintainer's own ask: a hundred saved hosts is the
 * scale this stops being optional at, and a host is found here by what it is
 * called, not by the address behind it, which somebody typing a search
 * mostly does not have memorised. A group left with nothing to show drops
 * out entirely rather than staying as a heading over an empty list.
 */
export function filterGroups(groups: readonly SessionGroup[], query: string): readonly SessionGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return groups;

  return groups
    .map((group) => ({
      ...group,
      sessions: group.sessions.filter((live) => live.session.name.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.sessions.length > 0);
}

/**
 * Everything but the one group asked to be alone.
 *
 * `null` means nobody asked, which is most of the time and is why this
 * returns the same array reference then: a hundred hosts is exactly the
 * scale where re-filtering an unchanged list on every render is wasted work,
 * not a hundred rows' worth of wasted work either, but no reason to pay it
 * for a feature that is off.
 */
export function soloGroup(
  groups: readonly SessionGroup[],
  solo: string | null,
): readonly SessionGroup[] {
  if (solo === null) return groups;

  return groups.filter((group) => groupKey(group) === solo);
}

/**
 * Every group name already in use, for the host form's own suggestion list
 * (#221). Alphabetical, unlike `groupSessions`: that one preserves the file's
 * arrangement because it is showing hosts already placed in it, and this one
 * is helping somebody find a name among many before they have chosen one, the
 * way a picker reads better sorted than in whatever order hosts happened to
 * be saved.
 */
export function groupNames(sessions: readonly LiveSession[]): readonly string[] {
  return groupSessions(sessions)
    .map((group) => group.name)
    .filter((name): name is string => name !== null)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * One row of Home's own host book, ADR-0060: `depth`/`childrenShown` are
 * `orderChain`'s own (`jump.ts`), which already places a rider directly
 * beneath its bastion, cycle-safe, for `SessionsSidebar.tsx`. This is that
 * same placement, carrying a `LiveSession` instead of a bare `Session`
 * since Home's own list, unlike Sessions', has no connection state of its
 * own to look up separately.
 */
export interface HostRow {
  readonly live: LiveSession;
  readonly depth: number;
  readonly childrenShown: boolean;
}

export function hostRows(sessions: readonly LiveSession[]): readonly HostRow[] {
  const byId = new Map(sessions.map((live) => [live.session.id, live]));

  return orderChain(sessions.map((live) => live.session))
    .map((row) => {
      const live = byId.get(row.id);
      return live === undefined ? null : { live, depth: row.depth, childrenShown: row.childrenShown };
    })
    .filter((row): row is HostRow => row !== null);
}

/**
 * The book's own two sections (ADR-0060): a bastion and everything nested
 * under it, or a host with no jump relationship at all. `hostRows` already
 * places each row where it belongs in the chain; this only decides which
 * root starts which section, by the same `childrenShown` that root's own
 * row carries. A dangling `proxyJump` (a saved id nothing resolves to)
 * lands here as an ordinary root, in Bastions if it also carries something
 * and Direct otherwise, exactly like any other root.
 */
export interface HostSections {
  readonly bastions: readonly HostRow[];
  readonly direct: readonly HostRow[];
}

export function hostSections(rows: readonly HostRow[]): HostSections {
  const bastions: HostRow[] = [];
  const direct: HostRow[] = [];
  let bucket = direct;

  for (const row of rows) {
    if (row.depth === 0) bucket = row.childrenShown ? bastions : direct;
    bucket.push(row);
  }

  return { bastions, direct };
}

/**
 * Which saved hosts still answer a name search, and which bastions the
 * search has to force open to make its own answer true (ADR-0060).
 *
 * A bastion that does not itself match stays, exactly once, when a rider
 * nested under it does: dropping the bastion would leave that rider with
 * nothing to nest under, and a bastion the maintainer folded shut would
 * hide a host the filter box just claimed does not exist. `forceExpanded`
 * names every bastion kept for that reason alone, not because it matched
 * by name.
 */
export interface HostSearch {
  readonly survivors: readonly LiveSession[];
  readonly forceExpanded: ReadonlySet<string>;
}

export function filterHosts(sessions: readonly LiveSession[], query: string): HostSearch {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { survivors: sessions, forceExpanded: new Set() };

  const byId = new Map(sessions.map((live) => [live.session.id, live]));
  const childrenOf = new Map<string, LiveSession[]>();
  for (const live of sessions) {
    const parent = live.session.proxyJump ?? null;
    if (parent !== null && parent !== live.session.id && byId.has(parent)) {
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(live);
      childrenOf.set(parent, siblings);
    }
  }

  const matches = (live: LiveSession): boolean => live.session.name.toLowerCase().includes(needle);
  const forceExpanded = new Set<string>();

  const subtreeMatches = (live: LiveSession, seen: ReadonlySet<string>): boolean => {
    const children = childrenOf.get(live.session.id) ?? [];
    /* Mirrors `orderChain`'s own cycle guard: `seen` is checked against each
       child before descending into it, not against this call's own node,
       or seeding it with that node's id (needed so a cycle further down is
       still caught) would stop this node from ever looking at its
       children at all. */
    const childMatch = children.some((child) => {
      if (seen.has(child.session.id)) return false;
      return subtreeMatches(child, new Set([...seen, child.session.id]));
    });
    const selfMatch = matches(live);
    if (childMatch && !selfMatch) forceExpanded.add(live.session.id);
    return selfMatch || childMatch;
  };

  const survivors = sessions.filter((live) => subtreeMatches(live, new Set([live.session.id])));
  return { survivors, forceExpanded };
}

/**
 * Which rows in a section actually render, once a bastion's own fold state
 * hides what is nested under it. A collapsed root itself always stays
 * visible, only what is nested under it does not; `forceExpanded` (from
 * `filterHosts`) overrides a manual fold, since search saying a host exists
 * and then hiding the only row that shows it would be worse than not
 * folding at all.
 */
export function visibleHostRows(
  rows: readonly HostRow[],
  collapsed: ReadonlySet<string>,
  forceExpanded: ReadonlySet<string>,
): readonly HostRow[] {
  const visible: HostRow[] = [];
  let hiddenUnder: string | null = null;

  for (const row of rows) {
    if (row.depth === 0) {
      hiddenUnder =
        collapsed.has(row.live.session.id) && !forceExpanded.has(row.live.session.id)
          ? row.live.session.id
          : null;
      visible.push(row);
      continue;
    }

    if (hiddenUnder === null) visible.push(row);
  }

  return visible;
}

/**
 * The pill a row shows for its `group`, or `null` for a host with none.
 *
 * `undefined`, not `null`, is what actually arrives for a host with no
 * group: the core skips the field entirely rather than writing it out as
 * `null` (`jump.ts`'s `hasJumpHost` documents the same gotcha for
 * `proxyJump`). A strict `!== null` check here reads an absent field as
 * present.
 */
export function hostGroupLabel(session: Session): string | null {
  if (session.group === null || session.group === undefined) return null;
  const trimmed = session.group.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * How many rows a collapsed bastion is standing in for, keyed by the
 * bastion's own id: the number nested under it in this same section,
 * regardless of fold state. What a collapsed row shows in place of an
 * address, so folding a bastion does not also erase how much it was
 * carrying.
 */
export function hostSubtreeCounts(rows: readonly HostRow[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  let root: string | null = null;
  let count = 0;

  for (const row of rows) {
    if (row.depth === 0) {
      if (root !== null) counts.set(root, count);
      root = row.live.session.id;
      count = 0;
    } else {
      count += 1;
    }
  }
  if (root !== null) counts.set(root, count);

  return counts;
}
