/**
 * The session tabs in the titlebar.
 *
 * A tab is an open connection, not a selection. Clicking a saved host in the
 * sidebar looks at it; a tab means there is a channel behind it, and a tab
 * strip that also listed hosts nobody had connected to would be a list of
 * things that cannot be switched to.
 */

import type { ConnectionKind, LiveSession } from '../sessions';

export interface Tab {
  readonly sessionId: string;
  readonly title: string;
  readonly kind: ConnectionKind;
  /** `null` while the connection is still being made. */
  readonly handle: number | null;
}

/**
 * The sessions that have earned a tab, in the order the sidebar lists them.
 *
 * `attentionId` is the session an unresolved connection attempt names — one
 * waiting on a host key decision, on the credential window, or sitting on a
 * failure nobody has dismissed. It keeps its tab even with no handle, because
 * ADR-0015 renders those surfaces inside the session's own panel and a session
 * with no tab has no panel to render them in. Before it, failing dropped the
 * tab and took away the only place the failure could have been shown.
 */
export function openTabs(
  sessions: readonly LiveSession[],
  attentionId: string | null,
): readonly Tab[] {
  return sessions
    .filter(
      (live) =>
        live.handle !== null || live.kind === 'connecting' || live.session.id === attentionId,
    )
    .map((live) => ({
      sessionId: live.session.id,
      title: live.session.name,
      kind: live.kind,
      handle: live.handle,
    }));
}

/**
 * The tab an arrow key moves to.
 *
 * Wraps, because a tab strip is a ring and stopping dead at the end makes a
 * keyboard user check whether the key registered.
 */
export function tabAfter(
  tabs: readonly Tab[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  if (tabs.length === 0) return null;

  const at = tabs.findIndex((tab) => tab.sessionId === currentId);
  if (at < 0) return tabs[0]?.sessionId ?? null;

  const next = (at + step + tabs.length) % tabs.length;
  return tabs[next]?.sessionId ?? null;
}

/**
 * Which tab becomes active when one is closed.
 *
 * The neighbour to the right, falling back to the left. Landing on nothing
 * while tabs remain would blank the terminal and make the user pick a session
 * again for no reason.
 */
export function tabAfterClosing(
  tabs: readonly Tab[],
  closingId: string,
): string | null {
  const at = tabs.findIndex((tab) => tab.sessionId === closingId);
  if (at < 0) return null;

  const remaining = tabs.filter((tab) => tab.sessionId !== closingId);
  if (remaining.length === 0) return null;

  return remaining[Math.min(at, remaining.length - 1)]?.sessionId ?? null;
}

/**
 * Keeps the active tab pointing at something that exists.
 *
 * Tabs disappear when a host drops the connection, which nobody clicked.
 */
export function resolveActive(
  tabs: readonly Tab[],
  active: string | null,
): string | null {
  if (active !== null && tabs.some((tab) => tab.sessionId === active)) {
    return active;
  }

  return tabs[0]?.sessionId ?? null;
}
