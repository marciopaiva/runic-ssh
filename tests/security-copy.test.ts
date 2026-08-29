/**
 * Turns the review notes in `src/lib/i18n/locales.ts` into something that can
 * fail (#192). A review is of strings, and strings keep being added; a
 * paragraph and a date cannot tell when it stops being true, and twice
 * already it did not, silently, because nothing could notice.
 *
 * Two failures, matching the two ways that happened:
 *
 * - a new catalogue key that reads as security copy and was never added to
 *   `SECURITY_COPY_KEYS`, so no review's scope was ever asked to cover it;
 * - a key already inside a locale's reviewed scope whose translated text
 *   changed after the date recorded for it, so the paragraph kept claiming
 *   coverage it no longer had.
 *
 * Neither check can tell whether a review actually happened, only whether
 * the record of one is still consistent with the catalogue it describes.
 * That is the same honesty `tests/i18n.test.ts` has about the compile-time
 * half of ADR-0007's guarantee: some of this is not a runtime value.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SOURCE_CATALOG } from '../src/lib/i18n/catalog.generated';
import { hashOf, matchesMarker, MARKER_WORDS, REVIEWS, SECURITY_COPY_KEYS } from './security-copy-keys';

const localesDir = fileURLToPath(new URL('../src/locales', import.meta.url));
const read = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(`${localesDir}/${locale}.json`, 'utf8')) as Record<string, string>;

describe('which keys count as security copy', () => {
  it('lists every catalogue key that reads like one', () => {
    const listed = new Set(SECURITY_COPY_KEYS);
    const missed = Object.entries(SOURCE_CATALOG)
      .filter(([key, message]) => matchesMarker(key, message) && !listed.has(key as never))
      .map(([key]) => key);

    expect(
      missed,
      `these keys match a security marker (${MARKER_WORDS.join(', ')}) and are not in ` +
        `SECURITY_COPY_KEYS: ${missed.join(', ')}. Either they describe a security decision, ` +
        "and belong in the list and in a native speaker's review, or they do not. Decide which " +
        'and say so in the list.',
    ).toEqual([]);
  });

  it('has no key SECURITY_COPY_KEYS names but en.json does not', () => {
    const unknown = SECURITY_COPY_KEYS.filter((key) => !(key in SOURCE_CATALOG));
    expect(unknown).toEqual([]);
  });
});

describe('what a recorded review actually covers', () => {
  it.each(Object.entries(REVIEWS))('%s: every reviewed key is security copy', (_locale, review) => {
    const stray = review.keys.filter((key) => !SECURITY_COPY_KEYS.includes(key));
    expect(stray, `reviewed but not in SECURITY_COPY_KEYS: ${stray.join(', ')}`).toEqual([]);
  });

  it.each(Object.entries(REVIEWS))(
    '%s: the reviewed text still matches what was recorded on %s',
    (locale, review) => {
      const actual = hashOf(read(locale), review.keys);
      expect(
        actual,
        `${locale}'s reviewed text has changed since ${review.date}. Either the edit was reviewed ` +
          'and REVIEWS.hash needs updating to match, or it was not and the string should not ship ' +
          'until it is.',
      ).toBe(review.hash);
    },
  );
});
