/**
 * The locale registry.
 *
 * Availability is carried separately from existence on purpose. A catalogue can
 * be complete, translated and covered by the parity tests, and still not be
 * offered: that was Spanish's own state until v0.2.1, held back until a
 * native speaker had reviewed its security copy, because a mistranslated
 * host key warning is a vulnerability rather than a typo. See ADR-0007 and
 * the note below on what changed and what still has not (#227).
 *
 * Portuguese is offered *and* reviewed. The maintainer is a native speaker,
 * wrote it, and confirmed its security copy on 2026-08-25, on **2026-08-26** for
 * the eighteen strings added or reworded since, and again at the **v0.2.1**
 * sweep for the thirty added after that: the editor's password block, the four
 * endings a kept credential can have, the jump host's refused keep, and the copy
 * about a host carrying somebody else's session. That pass also replaced
 * `keychain` with `chaveiro` throughout, which is the word somebody using the
 * application in Portuguese would actually reach for.
 *
 * That is written down here rather than left in the conversation it was said in,
 * because the rule this file enforces is about the claim: nobody says these
 * strings have been checked until somebody has, and a locale offered on nothing
 * more than having been written by whoever needed it is the state that rule
 * exists to end.
 *
 * **Spanish is offered from v0.2.1**, which is the one-line change ADR-0007 said
 * this would be. A native Spanish speaker, a contributor in the maintainer's
 * network, read the security copy #4 scopes: both host key screens with their
 * fingerprint and override copy, the vault failures including the fallback for a
 * machine with no secret service, and the authentication errors that say what to
 * do next. They verified rather than translated, which is the job that issue
 * describes, and the English stayed normative where the two could have
 * disagreed. What it changed was mostly consistency: the catalogue addressed the
 * reader as `tú` in some strings and `usted` in others.
 *
 * They asked not to be named, and #4 asks for a named reviewer, so that part of
 * its wording is not met and is worth saying rather than glossing. What the name
 * would have carried is somebody to ask, and the maintainer confirmed this
 * review and stands behind it. That is a weaker claim than a name and a
 * stronger one than nothing, and stating which of the three it is beats
 * recording it as though a name existed.
 *
 * A date is load-bearing here, and it is the part that rots. A review is of
 * strings, and strings keep being added: between the first two dates the
 * catalogue gained twenty-three, fifteen of which say where a keystroke or a
 * secret goes, and the note above them still read as though it covered them. It
 * happened again before v0.2.1, by thirty. Nothing failed either time, because
 * nothing could (#192).
 *
 * Now something can. `tests/security-copy-keys.ts` lists which catalogue keys
 * describe a security decision and, for each reviewed locale, which of those
 * keys the review above actually covered and a hash of their translated text
 * at review time. `tests/security-copy.test.ts` fails when a new key reads as
 * security copy and was never added to that list, and fails again when a
 * listed key's translation changes without the hash moving with it. Extending
 * the paragraph above without touching that file is how the claim goes stale
 * again; update both together.
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
  { tag: 'es', name: en['language.es'], offered: true, catalog: es },
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
