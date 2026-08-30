/**
 * Which saved hosts may serve as a jump host.
 *
 * Mirrors `config::sessions::check_proxy_jump`, which is what actually
 * refuses. Offering only what the core will accept is what turns its three
 * refusals from a message after a save into a choice that was never there:
 * a session cannot be picked as its own jump host if it is not in the list,
 * and it cannot be pointed at a host that is itself behind one.
 *
 * The core still checks. This is the form being helpful, not the form being
 * trusted.
 */

import type { Session } from '../../ipc';

export function eligibleJumpHosts(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
): readonly Session[] {
  /* ADR-0031's kind is otherwise decoration; this is the one place it
     narrows a choice rather than only labelling one. A bastion is a role
     the maintainer tags a host with on purpose, and a database or a web
     host offered in the same list invites picking one that happens to be
     reachable rather than one that is meant to carry other connections. */
  return sessions.filter(
    (session) =>
      session.id !== editing && !hasJumpHost(session) && session.kind === 'jumpServer',
  );
}

/**
 * Whether a session is reached through another one.
 *
 * Absent and null both mean no, and the difference is not academic. The core
 * skips the field entirely when there is none, so what arrives for an ordinary
 * host is `undefined` and never `null`, whatever the declared type says. A
 * strict comparison against `null` here matched nothing, the select found no
 * eligible hosts, and the control was absent from the form. Every test passed:
 * they built sessions with the field written out as `null`, which is a shape
 * the core does not send.
 */
function hasJumpHost(session: Session): boolean {
  return (session.proxyJump ?? null) !== null;
}

/**
 * How a session sits in a chain, if it does at all.
 *
 * Static: both answers come from the saved list and neither needs anything to
 * be connected. That is what makes marking them cheap, and what makes it a
 * different question from #168, which is about a connection that exists right
 * now and that nothing on screen admits to.
 *
 * Both can be true at once. The core refuses a jump host that is itself behind
 * one when it is chosen, but nothing stops a host that is already serving as a
 * bastion from being given one of its own afterwards, which leaves a chain a
 * hop too long that only fails when somebody connects. Showing both marks is
 * how that becomes visible before then.
 */
export interface JumpRole {
  /** Other saved hosts are reached through this one. */
  readonly carries: boolean;
  /** This host is reached through another. */
  readonly rides: boolean;
}

export function jumpRole(session: Session, sessions: readonly Session[]): JumpRole {
  return {
    carries: sessions.some((other) => other.proxyJump === session.id),
    /* Absent and null both mean no. The core skips the field entirely for a
       host that is not behind one, so what arrives is `undefined`. */
    rides: (session.proxyJump ?? null) !== null,
  };
}

/**
 * The name of the bastion a host rides, or `null` when it rides none or the
 * saved list no longer has one by that id.
 *
 * `rides` alone answers one question, "is this host behind something";
 * `carries` is the other side of the same fact and is never one name, since a
 * bastion can carry more than one host. Riding is always exactly one, so it
 * is always namable, and the name is what a jump-topology group separate
 * from an environment group (bastions of their own, DEV/HOM/PRD apart from
 * them) actually needs: which of the bastions, not only that there is one.
 */
export function bastionName(session: Session, sessions: readonly Session[]): string | null {
  const parentId = session.proxyJump ?? null;
  if (parentId === null) return null;

  return sessions.find((other) => other.id === parentId)?.name ?? null;
}

/** One row of an ordered chain: which host, and how far under its bastion. */
export interface ChainRow {
  readonly id: string;
  /** 0 for a host with no bastion in this same list. */
  readonly depth: number;
  /** Whether this host's own riders are the rows immediately beneath it. */
  readonly childrenShown: boolean;
}

/**
 * Places a host directly beneath the bastion it rides, in the same list,
 * rather than marking the relation with a glyph.
 *
 * The row used to carry three signals at once (state, kind, chain), and the
 * chain one was the one the maintainer asked to cut: most hosts are neither
 * end of one, so a mark for it was on almost every row saying nothing. A
 * relation between two rows is layout before it is vocabulary, so this turns
 * it into position instead of a fourth icon.
 *
 * Scoped to the list it is given, deliberately: a host whose bastion is
 * filed under a different heading has nothing to nest under here, and
 * `SessionsSidebar` falls back to `JumpMark`'s glyph for exactly that case
 * rather than silently dropping the only signal it had.
 *
 * Self-reference and a cycle are both guarded against, not because the core
 * is expected to write one, but because this reads a file a person can edit
 * by hand. A plain two-way cycle (A rides B, B rides A) has no node the first
 * pass below would call a root at all, since each looks like a valid child of
 * the other; left uncorrected that drops both hosts from the list rather than
 * merely their indentation, which is a worse failure than the one this
 * function exists to fix. The second pass catches whatever the first one
 * never reached and emits it flat, so a malformed file loses a chain's shape
 * and never a host.
 */
export function orderChain(sessions: readonly Session[]): readonly ChainRow[] {
  const ids = new Set(sessions.map((session) => session.id));
  const childrenOf = new Map<string, Session[]>();
  const roots: Session[] = [];

  for (const session of sessions) {
    const parent = session.proxyJump ?? null;
    if (parent !== null && parent !== session.id && ids.has(parent)) {
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(session);
      childrenOf.set(parent, siblings);
    } else {
      roots.push(session);
    }
  }

  const rows: ChainRow[] = [];
  const emitted = new Set<string>();

  const visit = (session: Session, depth: number, seen: ReadonlySet<string>): void => {
    if (emitted.has(session.id)) return;
    emitted.add(session.id);

    const children = childrenOf.get(session.id) ?? [];
    rows.push({
      id: session.id,
      depth,
      childrenShown: children.some((child) => !seen.has(child.id)),
    });

    for (const child of children) {
      if (seen.has(child.id)) continue;
      visit(child, depth + 1, new Set([...seen, child.id]));
    }
  };

  for (const session of roots) visit(session, 0, new Set([session.id]));
  for (const session of sessions) {
    if (!emitted.has(session.id)) visit(session, 0, new Set([session.id]));
  }

  return rows;
}

/**
 * What the editor may offer for "reached through", and why.
 *
 * `eligibleJumpHosts` answers the question from one side: which saved hosts
 * are usable as a bastion. This answers it from the other, which is the side
 * #171 was about: a host that other sessions are already reached through
 * cannot be given a jump host of its own, because that is their chain made two
 * hops long by editing a host they do not appear on.
 *
 * The core refuses it either way (`config::sessions::check_not_serving`). What
 * this is for is the form, which should not offer a choice that will be
 * refused, and should say whose connection is at stake rather than only saying
 * no.
 */
export interface JumpHostChoice {
  /** The hosts to offer, in order. Empty means the control has nothing to show. */
  readonly offered: readonly Session[];
  /**
   * The saved hosts reached through the one being edited.
   *
   * Non-empty means no jump host may be chosen, and these are the names the
   * message needs: "no" alone leaves somebody to work out which of their hosts
   * they are being protected from breaking.
   */
  readonly carried: readonly Session[];
}

export function jumpHostChoice(
  sessions: readonly Session[],
  /** The session being edited, or `null` when creating one. */
  editing: string | null,
  /** The id currently in the field, empty for none. */
  chosen: string,
): JumpHostChoice {
  const carried = editing === null ? [] : sessions.filter((other) => other.proxyJump === editing);

  if (carried.length === 0) {
    const offered = eligibleJumpHosts(sessions, editing);

    /* A bastion already chosen stays offered even if its kind is not, or is
       no longer, `jumpServer`. A session saved before ADR-0031 existed, or
       retagged since, must not have its own field make its stored choice
       disappear. The same reasoning `carried` below already rests on: a
       form that stops offering a value it is still holding needs a way to
       clear it, not a silent mismatch between the select and the string. */
    if (chosen !== '' && !offered.some((session) => session.id === chosen)) {
      const current = sessions.find((session) => session.id === chosen);
      if (current !== undefined) return { offered: [...offered, current], carried };
    }

    return { offered, carried };
  }

  /* A host in this state can already be in the file: the check is new and the
     sessions are not. Offering the value it holds, and nothing else, is what
     leaves a way to clear it. Offering the eligible list instead would be a
     form contradicting its own message, and offering nothing at all would make
     a session saved before this check unfixable from the editor. */
  const current = sessions.find((session) => session.id === chosen);

  return { offered: current === undefined ? [] : [current], carried };
}
