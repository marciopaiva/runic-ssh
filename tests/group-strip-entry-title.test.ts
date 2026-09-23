/**
 * Guards `entryTitle`'s naming of the second shell ADR-0077 allows.
 *
 * The secondary shell shares its session's saved name with the primary: same
 * host, same saved entry, only a second channel over the same connection.
 * Without the suffix this checks for, the tab strip would show two tabs
 * reading identically, which looks like a rendering bug rather than a
 * deliberate second shell.
 */

import { describe, expect, it } from 'vitest';

import { entryTitle } from '../src/components/GroupStrip';
import { createTranslator } from '../src/lib/i18n';
import type { Focus, Tab } from '../src/features/chrome';

const i18n = createTranslator('en');

const TABS: readonly Tab[] = [{ sessionId: 'a', title: 'prod-db', kind: 'connected', handle: 1 }];

const PRIMARY: Focus = { kind: 'session', sessionId: 'a' };
const SECONDARY: Focus = { kind: 'session', sessionId: 'a', slot: 'secondary' };

describe('naming a session tab (ADR-0077)', () => {
  it('is the saved name alone for the primary shell', () => {
    expect(entryTitle(PRIMARY, TABS, [], [], i18n)).toBe('prod-db');
  });

  it('carries the same saved name into the secondary shell\'s suffix', () => {
    expect(entryTitle(SECONDARY, TABS, [], [], i18n)).toBe('prod-db (2)');
  });

  it('differs from the primary tab\'s title so the two never read as one duplicated tab', () => {
    const primaryTitle = entryTitle(PRIMARY, TABS, [], [], i18n);
    const secondaryTitle = entryTitle(SECONDARY, TABS, [], [], i18n);

    expect(secondaryTitle).not.toBe(primaryTitle);
  });

  it('still applies the suffix around an empty name for a session with no matching tab', () => {
    /* `stripEntries` never produces this combination (a secondary entry only
       exists for a session already in `tabs`), but `entryTitle` takes any
       `Focus`, so this pins what it does rather than leaving it undefined. */
    const gone: Focus = { kind: 'session', sessionId: 'gone', slot: 'secondary' };

    expect(entryTitle(gone, TABS, [], [], i18n)).toBe(' (2)');
  });
});
