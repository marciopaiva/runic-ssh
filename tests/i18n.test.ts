/**
 * Covers the catalogue machinery and the catalogues themselves.
 *
 * The compile-time half of ADR-0007's guarantee cannot be asserted here — a
 * missing key is a type error, and a type error is not a runtime value. What
 * these cover is the half that survives compilation: catalogue parity, locale
 * resolution, and the formatting `Intl` does on our behalf.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createTranslator,
  formatBytes,
  formatList,
  LOCALES,
  offeredLocales,
  pluralCategory,
  resolveLocale,
} from '../src/lib/i18n';

const localesDir = fileURLToPath(new URL('../src/locales', import.meta.url));
const read = (file: string): Record<string, string> =>
  JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as Record<string, string>;

describe('catalogues', () => {
  const source = read('en.json');
  const others = readdirSync(localesDir).filter((f) => f !== 'en.json' && f.endsWith('.json'));

  it('has a catalogue for every registered locale', () => {
    for (const locale of LOCALES) {
      expect(read(`${locale.tag}.json`), `${locale.tag} has no catalogue`).toBeDefined();
    }
  });

  it.each(others)('%s has exactly the keys en.json has', (file) => {
    const target = read(file);
    const missing = Object.keys(source).filter((k) => !(k in target));
    const extra = Object.keys(target).filter((k) => !(k in source));

    expect(missing, `${file} is missing ${missing.join(', ')}`).toEqual([]);
    expect(extra, `${file} has ${extra.join(', ')}, which en.json does not`).toEqual([]);
  });

  it.each(others)('%s keeps the same placeholders as en.json', (file) => {
    /* A translation that drops {host} renders a sentence with a hole in its
       meaning, and nothing at runtime complains. */
    const target = read(file);
    const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

    for (const [key, message] of Object.entries(source)) {
      const translated = target[key];
      if (translated === undefined) continue;
      expect(holes(translated), `${file}:${key} changed its placeholders`).toEqual(holes(message));
    }
  });

  /* ADR-0020 named the rectangles in the main area **groups**, and everything
     written since uses that word: the decision records, the changelog, the
     README and the code comments. The strings did not follow, and nothing
     failed. Ten of them still called a group a pane after the anatomy changed
     under them, and one told the person confirming a paste that it would reach
     every pane on screen when it reaches the active tab of each group (#180).

     A banned word is a blunt guard and this one is worth it. The mistake it
     catches is not a typo: it is a string written next to another string that
     was already wrong, which is how all ten got there. */
  it('never calls a group a pane', () => {
    const offending = Object.entries(source)
      .filter(([, message]) => /\bpanes?\b/i.test(message))
      .map(([key]) => key);
    expect(offending, 'ADR-0020 calls these groups').toEqual([]);
  });

  it.each(others)('%s translates something', (file) => {
    /* A catalogue copied wholesale from English is not a translation, and the
       parity tests above would happily pass it. */
    const target = read(file);
    const differing = Object.keys(source).filter((k) => target[k] !== source[k]);
    expect(differing.length, `${file} is identical to en.json`).toBeGreaterThan(0);
  });
});

describe('locale resolution', () => {
  it('offers only the locales cleared to be offered', () => {
    const offered = offeredLocales().map((l) => l.tag);
    expect(offered).toContain('en');
    expect(offered).toContain('pt-BR');
    /* Held back until its security copy is reviewed. See ADR-0007 and #4. */
    expect(offered).not.toContain('es');
  });

  it('never resolves to a locale that is not offered', () => {
    expect(resolveLocale('es').tag).not.toBe('es');
    expect(resolveLocale('es-AR').tag).not.toBe('es');
  });

  it('prefers the same language over the default', () => {
    /* A speaker of European Portuguese reading Brazilian Portuguese is a far
       smaller failure than one reading English. */
    expect(resolveLocale('pt-PT').tag).toBe('pt-BR');
    expect(resolveLocale('pt').tag).toBe('pt-BR');
  });

  it('falls back for anything unknown, absent or empty', () => {
    expect(resolveLocale('kl-GL').tag).toBe('en');
    expect(resolveLocale(undefined).tag).toBe('en');
    expect(resolveLocale('   ').tag).toBe('en');
  });

  it('matches a tag whatever its casing', () => {
    expect(resolveLocale('PT-br').tag).toBe('pt-BR');
  });
});

describe('translation', () => {
  it('returns the message for the resolved locale', () => {
    expect(createTranslator('pt-BR').t('tabs.empty')).toBe('Nenhuma sessão aberta');
  });

  it('fills placeholders', () => {
    /* Through the translator itself. This test used to re-implement `fill`
       and assert against its own copy, which passed whatever the translator
       did. */
    expect(createTranslator('en').t('tabs.close', { name: 'web-01' })).toBe('Close web-01');
    expect(createTranslator('pt-BR').t('tabs.close', { name: 'web-01' })).toBe('Fechar web-01');
  });

  it('leaves an unfilled placeholder visible', () => {
    /* Silently rendering an empty string hides the bug; showing {name} does
       not, and the types make it hard to reach in the first place — reaching
       it here needs the parameter object cast away. */
    const translator = createTranslator('en') as unknown as {
      t: (key: string, params: Record<string, string>) => string;
    };

    expect(translator.t('tabs.close', {})).toBe('Close {name}');
  });
});

describe('formatting through Intl', () => {
  it('uses the decimal comma where the locale does', () => {
    /* The bug this prevents arrives as "the numbers are wrong". */
    expect(formatBytes('pt-BR', 2_400_000)).toBe('2,4 MB');
    expect(formatBytes('es', 2_400_000)).toBe('2,4 MB');
    expect(formatBytes('en', 2_400_000)).toBe('2.4 MB');
  });

  it('reports whole bytes without a decimal', () => {
    expect(formatBytes('en', 512)).toBe('512 B');
  });

  it('scales through the units', () => {
    expect(formatBytes('en', 18_200_000)).toBe('18.2 MB');
    expect(formatBytes('en', 1_000)).toBe('1.0 KB');
  });

  it('refuses a nonsense size rather than inventing one', () => {
    expect(formatBytes('en', -1)).toBe('—');
    expect(formatBytes('en', Number.NaN)).toBe('—');
  });

  it('joins names with each language own conjunction', () => {
    /* Joining with a comma and the English "and" is the sort of thing that
       reads as translated by a machine, in a sentence naming the user own
       hosts. #171 put one on the session editor. */
    expect(formatList('en', ['web-01', 'db-02'])).toBe('web-01 and db-02');
    expect(formatList('pt-BR', ['web-01', 'db-02'])).toBe('web-01 e db-02');
    expect(formatList('en', ['web-01'])).toBe('web-01');
  });

  it('uses each language own plural categories', () => {
    /* English has no "one" for zero; Brazilian Portuguese does. Hard-coding
       `count === 1` would be wrong in one of them. */
    expect(pluralCategory('en', 0)).toBe('other');
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('pt-BR', 0)).toBe('one');
  });
});

describe('the generated catalogue types', () => {
  it('match the JSON they are derived from', () => {
    /* `catalog.generated.ts` exists only so the compiler can read what a
       message says — TypeScript widens JSON string values to `string`, which
       is why an earlier version of this module could not see placeholders at
       all. It is regenerated by `pnpm typecheck`, and this catches the case
       where someone edits en.json and runs only the tests. */
    const generated = readFileSync(
      fileURLToPath(new URL('../src/lib/i18n/catalog.generated.ts', import.meta.url)),
      'utf8',
    );

    for (const [key, message] of Object.entries(read('en.json'))) {
      expect(
        generated.includes(JSON.stringify(key)),
        `${key} is in en.json but not in the generated types; run pnpm typecheck`,
      ).toBe(true);
      expect(
        generated.includes(JSON.stringify(message)),
        `${key} differs between en.json and the generated types; run pnpm typecheck`,
      ).toBe(true);
    }
  });
});
