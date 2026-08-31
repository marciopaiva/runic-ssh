/**
 * What the tab strip is pointing at.
 *
 * The strip holds four different things: the open sessions, an SFTP browser
 * on one of them, a host editor, and the settings tab. `tabs.ts` deliberately
 * knows nothing about the last three. Its own doc comment says a tab is an
 * open connection rather than a selection, and that stays true: `openTabs`
 * still derives only from sessions, and the union of all four lives here, in
 * the shell's own model.
 *
 * A union rather than a reserved session id. Session ids are sixteen hex
 * characters, but `new_id`'s fallback in the core is `{n}-{host}` — free text
 * that came from the user — so "a sentinel that happens not to collide" is a
 * bug waiting to be written rather than an invariant. The editor carries its
 * `EditorTarget` for the same reason: `'new'` as a magic id would be exactly
 * that sentinel.
 *
 * `sftp` carries a session id rather than its own kind of id, because it is
 * not a second connection: #127 opens an SFTP subsystem on the channel the
 * session already has, and there is at most one such tab per session, the
 * same way there is at most one shell tab per session.
 *
 * The three used to be woven together by hand, one branch per combination.
 * With a fourth kind that stops scaling, so the strip is built once as an
 * ordered list and every question is asked of that list instead.
 */

import { tabAfter } from './tabs';
import type { Tab } from './tabs';
import type { EditorTarget } from '../sessions/editor';

export type Focus =
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'sftp'; readonly sessionId: string }
  | { readonly kind: 'editor'; readonly target: EditorTarget }
  | { readonly kind: 'settings' };

/**
 * What the strip holds, left to right: sessions, an SFTP tab beside each one
 * that has one open, then the host forms in the order they were opened, then
 * settings.
 *
 * Session tabs keep the sidebar's order at the front and settings stays at the
 * end, so opening or closing a form never shifts either sideways under the
 * pointer. An SFTP tab is placed right after the session it belongs to,
 * matching where it is drawn: beside the shell tab for the same host, not
 * apart from it.
 */
export function stripEntries(
  tabs: readonly Tab[],
  sftpOpen: ReadonlySet<string>,
  editing: readonly EditorTarget[],
  settingsOpen: boolean,
): readonly Focus[] {
  const entries: Focus[] = [];

  for (const tab of tabs) {
    entries.push({ kind: 'session', sessionId: tab.sessionId });
    if (sftpOpen.has(tab.sessionId)) entries.push({ kind: 'sftp', sessionId: tab.sessionId });
  }

  for (const target of editing) entries.push({ kind: 'editor', target });
  if (settingsOpen) entries.push({ kind: 'settings' });

  return entries;
}

/** Whether two focuses point at the same tab. */
export function sameFocus(a: Focus | null, b: Focus | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;

  if (a.kind === 'session' && b.kind === 'session') return a.sessionId === b.sessionId;
  if (a.kind === 'sftp' && b.kind === 'sftp') return a.sessionId === b.sessionId;

  if (a.kind === 'editor' && b.kind === 'editor') {
    if (a.target.kind !== b.target.kind) return false;
    return (
      a.target.kind === 'new' ||
      (b.target.kind === 'existing' && a.target.sessionId === b.target.sessionId)
    );
  }

  return true;
}

/**
 * The session being looked at, or `null` when the editor or settings is.
 *
 * True for an SFTP tab too: it is a second view on the same session, not a
 * second thing to be looking at, so the sidebar highlights the host it
 * belongs to exactly as it would for that host's shell tab.
 */
export function focusedSession(focus: Focus | null): string | null {
  return focus?.kind === 'session' || focus?.kind === 'sftp' ? focus.sessionId : null;
}

/**
 * Keeps the focus pointing at something that is still on the strip.
 *
 * Every one of the three moves without anybody clicking: a session tab
 * disappears when its host drops the connection, the editor closes when a new
 * host is saved, and settings closes from a command. Resolving on render is
 * what stops the panel showing nothing with tabs still on the bar.
 */
export function resolveFocus(entries: readonly Focus[], focus: Focus | null): Focus | null {
  if (entries.some((entry) => sameFocus(entry, focus))) return focus;

  return entries[0] ?? null;
}

/**
 * The tab an arrow key moves to.
 *
 * Everything on the strip is in the ring, in the order it is drawn. A tab that
 * can be clicked but not reached with a keyboard is the kind of gap ADR-0005
 * warned this titlebar would have to be careful about, having taken the window
 * chrome away from the platform.
 */
export function focusAfter(
  entries: readonly Focus[],
  focus: Focus | null,
  step: 1 | -1,
): Focus | null {
  if (entries.length === 0) return null;

  const at = entries.findIndex((entry) => sameFocus(entry, focus));

  /* Focused on nothing yet: start at the first tab, whichever way the ring is
     being turned, rather than making the user press twice to see anything. */
  if (at < 0) return entries[0] ?? null;

  return entries[(at + step + entries.length) % entries.length] ?? null;
}

/** Which tab takes over when the one at `focus` leaves the strip. */
export function focusAfterClosing(
  entries: readonly Focus[],
  closing: Focus,
): Focus | null {
  const remaining = entries.filter((entry) => !sameFocus(entry, closing));
  if (remaining.length === 0) return null;

  const at = entries.findIndex((entry) => sameFocus(entry, closing));

  /* The neighbour to the right, falling back to the left — the same rule
     `tabAfterClosing` applies to sessions, now that three kinds share a ring. */
  return remaining[Math.min(at < 0 ? 0 : at, remaining.length - 1)] ?? null;
}

/** Kept for the session-only ring the sidebar still walks. */
export { tabAfter };

/**
 * The DOM id of the tab a focus is drawn as.
 *
 * Stable across renders and unique across the window, because an entry lives
 * in exactly one group. Both ends need it: the strip sets it, and moving focus
 * by keyboard has to find the button it just switched to.
 */
export function tabElementId(focus: Focus): string {
  if (focus.kind === 'settings') return 'settings-tab';
  if (focus.kind === 'editor') {
    return focus.target.kind === 'new' ? 'editor-tab-new' : `editor-tab-${focus.target.sessionId}`;
  }
  if (focus.kind === 'sftp') return `sftp-tab-${focus.sessionId}`;

  return `session-tab-${focus.sessionId}`;
}

/**
 * The DOM id of the surface that tab switches to.
 *
 * Derived from the tab's own id rather than invented separately, so the two
 * cannot drift. This exists because groups made one shared panel wrong: four
 * strips all pointing `aria-controls` at the main area would tell a screen
 * reader that every tab switches the same region, which stopped being true the
 * moment the area was divided.
 */
export function panelElementId(focus: Focus): string {
  return `panel-${tabElementId(focus)}`;
}
