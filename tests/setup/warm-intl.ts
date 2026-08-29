/**
 * Pays the first-construction cost of each offered locale's `Intl`
 * formatters before any test is timed.
 *
 * `Intl.NumberFormat`, `Intl.ListFormat`, `Intl.PluralRules` and
 * `Intl.RelativeTimeFormat` load ICU data lazily, on the first construction
 * for a given locale. On a cold Windows runner that load takes longer than a
 * single test's default budget, and whichever test happens to run first
 * against a non-English locale pays for all of them and times out (#186).
 * Module-level code in a setup file runs before Vitest starts timing
 * anything, so paying that cost here is free.
 */

import { offeredLocales } from '../../src/lib/i18n';

for (const { tag } of offeredLocales()) {
  new Intl.NumberFormat(tag).format(0);
  new Intl.ListFormat(tag).format(['a', 'b']);
  new Intl.PluralRules(tag).select(0);
  new Intl.RelativeTimeFormat(tag).format(-1, 'day');
}
