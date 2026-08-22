/**
 * The translator.
 *
 * Small on purpose. ADR-0007 chose this over an i18n library because the two
 * things actually needed — looking a key up and filling its holes — are these
 * few lines, while plural selection and every numeric format come from `Intl`.
 */

import { formatBytes, formatNumber, formatRelativeTime, pluralCategory } from './format';
import type { Catalog, MessageArgs, MessageKey } from './messages';
import { DEFAULT_LOCALE, findLocale, resolveLocale } from './locales';

export interface Translator {
  readonly locale: string;
  /**
   * Looks up a message and fills its placeholders.
   *
   * The parameter object is required when the message has holes and refused
   * when it does not, so neither a missing nor a spurious one compiles.
   */
  t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  bytes(value: number): string;
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string;
  plural(count: number): Intl.LDMLPluralRule;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function fill(message: string, params: Readonly<Record<string, unknown>>): string {
  return message.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    /* An unfilled hole is a bug the types should have caught, so it is left
       visible rather than replaced with an empty string that hides it. */
    return value === undefined ? whole : String(value);
  });
}

export function createTranslator(requestedLocale: string | undefined): Translator {
  const entry = resolveLocale(requestedLocale);
  const catalog: Catalog = entry.catalog;
  const { tag } = entry;

  return {
    locale: tag,

    t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
      const params = args[0];
      const message = catalog[key];
      /* The types make a missing key impossible, so this only fires when a
         catalogue has been edited to something the compiler never saw — and
         falling back to English beats rendering the key itself. */
      if (typeof message !== 'string') {
        const source = findLocale(DEFAULT_LOCALE)?.catalog[key];
        return typeof source === 'string' ? source : key;
      }
      return params === undefined ? message : fill(message, params);
    },

    number: (value, options) => formatNumber(tag, value, options),
    bytes: (value) => formatBytes(tag, value),
    relativeTime: (value, unit) => formatRelativeTime(tag, value, unit),
    plural: (count) => pluralCategory(tag, count),
  };
}
