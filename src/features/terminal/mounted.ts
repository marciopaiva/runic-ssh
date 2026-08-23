/**
 * Which terminals stay mounted.
 *
 * ADR-0014 keeps one terminal per session and hides the ones whose tab is not
 * active, rather than moving a single terminal between handles. Rebuilding it
 * on every switch took the scrollback with it, and made the core open a second
 * shell to replace the one nobody was reading any more (#94).
 *
 * The decision is a pure function so it can be asserted without a DOM: what
 * goes wrong here is invisible until somebody switches tabs.
 */

import type { Tab } from '../chrome/tabs';
import type { SessionHandle } from '../../ipc';

export interface MountedTerminal {
  readonly sessionId: string;
  /** Never `null`: a terminal with no handle has nothing to attach to. */
  readonly handle: SessionHandle;
}

/**
 * The tabs with a channel behind them, in the order the strip lists them.
 *
 * A connecting tab is deliberately left out. It has a tab so that a failure
 * has somewhere to be reported, but no handle yet, and mounting a terminal for
 * it would mean one that exists before there is anything to attach it to.
 */
export function mountedTerminals(tabs: readonly Tab[]): readonly MountedTerminal[] {
  const mounted: MountedTerminal[] = [];

  for (const tab of tabs) {
    if (tab.handle === null) continue;
    mounted.push({ sessionId: tab.sessionId, handle: tab.handle });
  }

  return mounted;
}
