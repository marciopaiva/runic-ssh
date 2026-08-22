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
    expect(createTranslator('pt-BR').t('app.shell.idle')).toBe('shell montado · nenhuma sessão ainda');
  });

  it('fills placeholders', () => {
    const fill = (message: string, params: Record<string, string>): string =>
      message.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);

    expect(fill('Connected to {host} as {user}', { host: 'web-01', user: 'deploy' })).toBe(
      'Connected to web-01 as deploy',
    );
  });

  it('leaves an unfilled placeholder visible', () => {
    /* Silently rendering an empty string hides the bug; showing {host} does
       not, and the types make it hard to reach in the first place. */
    const fill = (message: string, params: Record<string, string>): string =>
      message.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);

    expect(fill('Connected to {host}', {})).toBe('Connected to {host}');
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
