/**
 * Covers which language the application opens in.
 *
 * Kept as a pure function over a preference list so it is testable without a
 * DOM; the React wiring around it arrives with the first component tests.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { detectLocale, systemPreferences } from '../src/features/settings/detect-locale';

describe('locale detection', () => {
  it('takes the first preference it can actually offer', () => {
    expect(detectLocale(['pt-BR', 'en'])).toBe('pt-BR');
  });

  it('skips a language it cannot offer rather than falling to English', () => {
    /* Someone who asked for German first and Portuguese second wants
       Portuguese, not English: an unoffered first preference is skipped, not
       treated as the end of the list.

       This used to be written with Spanish, which was held out of the selector
       until its security copy was reviewed. It is offered now, so the case
       needs a language the registry genuinely does not have, or the test would
       be asserting nothing while still passing. */
    expect(detectLocale(['de', 'pt-BR'])).toBe('pt-BR');
  });

  it('takes Spanish now that it is offered', () => {
    /* The other half of the change above. Held back through v0.2.0 and cleared
       for v0.2.1, so somebody whose browser asks for Spanish gets it. */
    expect(detectLocale(['es', 'pt-BR'])).toBe('es');
  });

  it('matches a region it does not have to the language it does', () => {
    expect(detectLocale(['pt-PT'])).toBe('pt-BR');
  });

  it('falls back when nothing is understood', () => {
    expect(detectLocale(['kl-GL', 'is-IS'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('ignores casing, as browsers do not agree on it', () => {
    expect(detectLocale(['PT-br'])).toBe('pt-BR');
  });
});

describe('reading the system preference', () => {
  const original = Reflect.getOwnPropertyDescriptor(globalThis, 'navigator');

  const stub = (value: unknown): void => {
    Reflect.defineProperty(globalThis, 'navigator', { value, configurable: true });
  };

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, 'navigator');
    } else {
      Reflect.defineProperty(globalThis, 'navigator', original);
    }
  });

  it('takes the ordered list when the platform provides one', () => {
    stub({ languages: ['pt-BR', 'pt', 'en'], language: 'pt-BR' });
    expect(systemPreferences()).toEqual(['pt-BR', 'pt', 'en']);
  });

  it('falls back to the single language when there is no list', () => {
    /* Not every webview populates `languages`; all of them populate
       `language`. */
    stub({ language: 'pt-BR' });
    expect(systemPreferences()).toEqual(['pt-BR']);
  });

  it('treats an empty list as no preference rather than a preference for none', () => {
    stub({ languages: [], language: 'es' });
    expect(systemPreferences()).toEqual(['es']);
  });

  it('survives an environment with no navigator at all', () => {
    stub(undefined);
    expect(systemPreferences()).toEqual([]);
    expect(detectLocale(systemPreferences())).toBe('en');
  });
});
