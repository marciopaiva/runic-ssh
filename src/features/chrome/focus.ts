/**
 * What the tab strip is pointing at.
 *
 * The strip holds two different things: the open sessions, and — at most once,
 * at the end — the settings tab. `tabs.ts` deliberately knows nothing about
 * the second one. Its own doc comment says a tab is an open connection rather
 * than a selection, and that stays true: `openTabs` still derives only from
 * sessions, and the union of the two lives here, in the shell's own model.
 *
 * A union rather than a reserved session id. Session ids are sixteen hex
 * characters, but `new_id`'s fallback in the core is `{n}-{host}` — free text
 * that came from the user — so "a sentinel that happens not to collide" is a
 * bug waiting to be written rather than an invariant.
 */

import { tabAfter } from './tabs';
import type { Tab } from './tabs';

export type Focus =
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'settings' };

/** The session being looked at, or `null` when the settings tab is. */
export function focusedSession(focus: Focus | null): string | null {
  return focus?.kind === 'session' ? focus.sessionId : null;
}

/**
 * Keeps the focus pointing at something that is still on the strip.
 *
 * Both halves move without anybody clicking: a tab disappears when its host
 * drops the connection, and the settings tab disappears when it is closed from
 * a command. Resolving on render is what stops the panel showing nothing with
 * tabs still on the bar.
 */
export function resolveFocus(
  tabs: readonly Tab[],
  settingsOpen: boolean,
  focus: Focus | null,
): Focus | null {
  if (focus?.kind === 'settings' && settingsOpen) return focus;

  if (
    focus?.kind === 'session' &&
    tabs.some((tab) => tab.sessionId === focus.sessionId)
  ) {
    return focus;
  }

  const first = tabs[0]?.sessionId;
  if (first !== undefined) return { kind: 'session', sessionId: first };

  return settingsOpen ? { kind: 'settings' } : null;
}

/**
 * The tab an arrow key moves to, settings included.
 *
 * Settings sits at the end of the ring rather than outside it. A tab that can
 * be clicked but not reached with a keyboard is the kind of gap ADR-0005
 * already warned this titlebar would have to be careful about, having taken
 * the window chrome away from the platform.
 */
export function focusAfter(
  tabs: readonly Tab[],
  settingsOpen: boolean,
  focus: Focus | null,
  step: 1 | -1,
): Focus | null {
  if (!settingsOpen) {
    /* No settings tab to weave in, so the session ring answers unchanged. */
    const next = tabAfter(tabs, focusedSession(focus), step);
    return next === null ? null : { kind: 'session', sessionId: next };
  }

  if (tabs.length === 0) return { kind: 'settings' };

  const settingsAt = tabs.length;
  const at = focus?.kind === 'settings'
    ? settingsAt
    : tabs.findIndex((tab) => tab.sessionId === focusedSession(focus));

  /* Focused on nothing yet: start at the first tab, whichever way the ring is
     being turned, rather than making the user press twice to see anything. */
  if (at < 0) return { kind: 'session', sessionId: tabs[0]?.sessionId ?? '' };

  const next = (at + step + settingsAt + 1) % (settingsAt + 1);
  if (next === settingsAt) return { kind: 'settings' };

  const sessionId = tabs[next]?.sessionId;
  return sessionId === undefined ? { kind: 'settings' } : { kind: 'session', sessionId };
}
