/**
 * Picking a chart's own axis ceiling.
 *
 * A percentage reading always tops out at 100; something unbounded, like
 * load average, needs a ceiling chosen from what is actually on screen. This
 * is the "nice round number" step every charting library does the same way:
 * round up to 1, 2, 5 or 10 times a power of ten, so the axis reads 0.5 or
 * 50 rather than 0.42 or 46.
 */
export function niceMax(peak: number): number {
  if (peak <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const normalized = peak / magnitude;

  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
