/**
 * Guards the premise ADR-0032 rests on.
 *
 * The wizard's own inline credential field (`InlineCredentialForm`) lives in
 * the same document as the terminal, which is exactly what ADR-0008
 * refused to do, unless nothing renders remote output while the field is
 * on screen. ADR-0032 checked that and found it true: every `TerminalView`
 * is mounted inside `{workspace === 'sessions' && (...)}`, a plain
 * conditional, so switching to Home unmounts every one of them rather than
 * hiding them the way switching tabs *within* Sessions does (ADR-0014).
 *
 * That is a runtime condition, not a structural one, nothing like the
 * separate bundle `tests/credential-window.test.ts` checks for the
 * credential window. This is the equivalent floor for the wizard's inline
 * field: a change that widens the gate, or adds a second `TerminalView`
 * mount site outside it, fails here rather than silently reopening what
 * ADR-0032 relied on.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8');

describe('nothing renders remote output while Home is showing (ADR-0032)', () => {
  it('mounts a terminal in exactly one place', () => {
    const occurrences = [...source.matchAll(/<TerminalView\b/g)];
    expect(occurrences).toHaveLength(1);
  });

  it('mounts it only inside the Sessions workspace branch, before Home\'s own', () => {
    const sessionsGate = source.indexOf("{workspace === 'sessions' && (\n");
    /* ADR-0052 gave Home a second `workspace === 'home'` gate, for its own
       toolbar row, ahead of the one around Home's `<main>` in the document.
       The 8-space indent is what picks out the `<main>` gate specifically:
       the toolbar's own gate sits one level shallower, matched literally so
       a future reindent is caught here rather than this test silently
       finding the wrong one. */
    const homeGate = source.indexOf("        {workspace === 'home' && (");
    const terminalView = source.indexOf('<TerminalView');

    expect(sessionsGate, 'the Sessions workspace gate').toBeGreaterThan(-1);
    expect(homeGate, "the Home workspace gate").toBeGreaterThan(-1);
    expect(terminalView, 'the TerminalView mount site').toBeGreaterThan(-1);

    /* Between the two gates, not before either: inside the branch that
       unmounts when `workspace` stops being `'sessions'`, and never reached
       once Home's own branch has opened instead. */
    expect(terminalView).toBeGreaterThan(sessionsGate);
    expect(terminalView).toBeLessThan(homeGate);
  });

  it('gates the Sessions branch on workspace alone, not workspace plus something narrower', () => {
    /* `sidebarOpen` also gates a `workspace === 'sessions'` block, for the
       sidebar and not the terminal, and must not be mistaken for the one this
       file is about. Matched literally so a rename of either constant is
       caught here rather than by this test quietly checking nothing. */
    const gate = "{workspace === 'sessions' && (\n";
    expect(source).toContain(gate);
  });
});

describe('the map is the one other place a terminal mounts (ADR-0064)', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const srcDir = path.join(here, '..', 'src');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  it('mounts TerminalView in App.tsx and MapTerminals.tsx, nowhere else', () => {
    const sites = walk(srcDir)
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('TerminalView.tsx'))
      .filter((file) => /<TerminalView\b/.test(readFileSync(file, 'utf8')))
      /* Forward slashes whatever the platform: `path.relative` answers with
         backslashes on Windows, and CI runs there too. */
      .map((file) => path.relative(srcDir, file).split(path.sep).join('/'))
      .sort();
    expect(sites).toEqual(['App.tsx', 'components/map/MapTerminals.tsx']);
  });

  it('renders the map, and so its stack, only inside the map workspace branch', () => {
    const mapGate = source.indexOf("        {workspace === 'map' && (");
    const stage = source.indexOf('<MapStage');
    const homeGate = source.indexOf("        {workspace === 'home' && (");
    expect(mapGate, 'the Map workspace gate').toBeGreaterThan(-1);
    expect(stage, 'the MapStage mount site').toBeGreaterThan(mapGate);
    expect(source.indexOf('<MapStage', stage + 1)).toBe(-1);
    /* Home's branch comes first in the file; the map's stack is not in it. */
    expect(homeGate).toBeLessThan(mapGate);
    const mapTerminals = readFileSync(path.join(srcDir, 'components', 'map', 'MapTerminals.tsx'), 'utf8');
    const stageSource = readFileSync(path.join(srcDir, 'components', 'map', 'MapStage.tsx'), 'utf8');
    expect([...mapTerminals.matchAll(/<TerminalView\b/g)]).toHaveLength(1);
    expect([...stageSource.matchAll(/<MapTerminals\b/g)]).toHaveLength(1);
  });
});
