/**
 * Which language to open in.
 *
 * The operating system's preference reaches the webview as
 * `navigator.languages`, already ordered by how much the user wants each one.
 * Reading it here rather than asking the core keeps a dependency out of the
 * Rust side for something the platform hands us for free.
 *
 * Kept as a pure function over a list so it can be tested without a DOM.
 */

import { DEFAULT_LOCALE, resolveLocale } from '../../lib/i18n';

/**
 * Picks the first preference that resolves to an offered locale.
 *
 * Order matters: a user whose preferences are `['es', 'pt-BR']` should get
 * Portuguese rather than English, because they asked for it second and Spanish
 * is not offered yet.
 */
export function detectLocale(preferred: readonly string[]): string {
  for (const candidate of preferred) {
    const resolved = resolveLocale(candidate);
    /* `resolveLocale` always returns something, falling back to the default.
       A fallback is not a match, so only stop when the candidate was actually
       understood. */
    if (resolved.tag.toLowerCase().split('-')[0] === candidate.toLowerCase().split('-')[0]) {
      return resolved.tag;
    }
  }

  return DEFAULT_LOCALE;
}

/** Reads the browser's preference list, tolerating an environment without one. */
export function systemPreferences(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return typeof navigator.language === 'string' ? [navigator.language] : [];
}
