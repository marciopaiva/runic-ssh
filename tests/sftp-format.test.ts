/**
 * `formatModified`'s column wrapped onto two lines under a 12-hour locale
 * string like "Sep 10, 07:55 PM" (#381): 24-hour time is shorter and never
 * carries the AM/PM suffix that pushed it over.
 */

import { describe, expect, it } from 'vitest';

import { formatModified } from '../src/components/SftpPane';

describe('formatModified', () => {
  it('renders empty for no timestamp', () => {
    expect(formatModified(null)).toBe('');
  });

  it('never carries an AM/PM suffix', () => {
    const evening = Math.floor(new Date(2026, 8, 10, 19, 55).getTime() / 1000);
    expect(formatModified(evening)).not.toMatch(/[AP]M/i);
  });
});
