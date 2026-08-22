/**
 * Locale-aware formatting.
 *
 * All of this is in the webview already. `Intl` handles the decimal comma that
 * Portuguese and Spanish use, the plural categories that differ per language,
 * and relative time — which is why ADR-0007 could take a catalogue without a
 * formatting library attached.
 *
 * Formatters are cached because constructing one is the expensive part, and a
 * transfer list rebuilds these on every frame.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function cached<T>(store: Map<string, T>, key: string, make: () => T): T {
  const existing = store.get(key);
  if (existing !== undefined) return existing;
  const created = make();
  store.set(key, created);
  return created;
}

export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const key = `${locale}:${JSON.stringify(options ?? {})}`;
  return cached(numberFormats, key, () => new Intl.NumberFormat(locale, options)).format(value);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Formats a byte count for a transfer list or a file pane.
 *
 * Decimal units, not binary: an SFTP client reports what the server reports,
 * and servers count in powers of ten. Showing 18.2 MB where the remote says
 * 18.2 MB matters more than the pedantry of MiB.
 */
export function formatBytes(locale: string, bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }

  /* Whole bytes never carry a decimal; anything scaled gets one digit, which
     is enough to see progress move without the number jittering. */
  const digits = unit === 0 ? 0 : 1;
  const formatted = formatNumber(locale, value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return `${formatted} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** The plural category for a count, per the locale's own rules. */
export function pluralCategory(locale: string, count: number): Intl.LDMLPluralRule {
  return cached(pluralRules, locale, () => new Intl.PluralRules(locale)).select(count);
}

export function formatRelativeTime(
  locale: string,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  return cached(relativeFormats, locale, () =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
  ).format(value, unit);
}

/** Clears the formatter caches. Only the tests need this. */
export function resetFormatterCaches(): void {
  numberFormats.clear();
  pluralRules.clear();
  relativeFormats.clear();
}
