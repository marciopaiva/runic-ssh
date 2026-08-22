/**
 * The locale registry.
 *
 * Availability is carried separately from existence on purpose. A catalogue can
 * be complete, translated and covered by the parity tests, and still not be
 * offered: Spanish is held back until a native speaker has reviewed its
 * security copy, because a mistranslated host key warning is a vulnerability
 * rather than a typo. See ADR-0007 and issue #4.
 *
 * Keeping the catalogue in the tree rather than deleting it is what keeps the
 * parity guards covering it. A removed catalogue rots silently.
 */

import type { Catalog } from './messages';

import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ptBR from '../../locales/pt-BR.json';

export const DEFAULT_LOCALE = 'en';

export interface LocaleEntry {
  /** BCP 47 tag, used for both lookup and every `Intl` formatter. */
  readonly tag: string;
  /** The language's own name for itself, never translated. */
  readonly name: string;
  /** Whether it may be offered to a user. See the note above. */
  readonly offered: boolean;
  readonly catalog: Catalog;
}

export const LOCALES: readonly LocaleEntry[] = [
  { tag: 'en', name: en['language.en'], offered: true, catalog: en },
  { tag: 'pt-BR', name: en['language.pt-BR'], offered: true, catalog: ptBR },
  { tag: 'es', name: en['language.es'], offered: false, catalog: es },
];

/** The locales a user may choose between. */
export function offeredLocales(): readonly LocaleEntry[] {
  return LOCALES.filter((locale) => locale.offered);
}

export function findLocale(tag: string): LocaleEntry | undefined {
  return LOCALES.find((locale) => locale.tag === tag);
}

/**
 * Resolves a requested tag to a locale that is actually offered.
 *
 * Falls back by region before language: `pt-PT` should reach `pt-BR` rather
 * than English, because a Portuguese speaker reading Brazilian Portuguese is a
 * much smaller failure than one reading none of their own language.
 */
export function resolveLocale(requested: string | undefined): LocaleEntry {
  const fallback = findLocale(DEFAULT_LOCALE);
  /* The default is a member of LOCALES; this only satisfies the compiler. */
  if (fallback === undefined) throw new Error('the default locale is missing');
  if (requested === undefined) return fallback;

  const wanted = requested.trim();
  if (wanted === '') return fallback;

  const exact = LOCALES.find(
    (locale) => locale.offered && locale.tag.toLowerCase() === wanted.toLowerCase(),
  );
  if (exact !== undefined) return exact;

  const language = wanted.split('-')[0]?.toLowerCase() ?? '';
  const byLanguage = LOCALES.find(
    (locale) => locale.offered && locale.tag.toLowerCase().split('-')[0] === language,
  );

  return byLanguage ?? fallback;
}
