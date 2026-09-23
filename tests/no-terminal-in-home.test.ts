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
 * `SessionBody` now sits between that gate and `TerminalView`: it wraps the
 * terminal with the facet bar, but mounts unconditionally itself and mounts
 * exactly one `TerminalView` unconditionally in turn, so the gate still
 * reaches the terminal through it. The App.tsx checks below follow
 * `SessionBody`'s own mount site, since that is now the thing the workspace
 * gate directly controls; the second describe block checks the indirection
 * itself, that `SessionBody` does not add a second `TerminalView` or hide it
 * behind a condition of its own.
 *
 * That is a runtime condition, not a structural one, nothing like the
 * separate bundle `tests/credential-window.test.ts` checks for the
 * credential window. This is the equivalent floor for the wizard's inline
 * field: a change that widens the gate, or adds a second `TerminalView`
 * mount site outside it, fails here rather than silently reopening what
 * ADR-0032 relied on.
 *
 * ADR-0077 adds one sanctioned exception: the second shell it allows mounts
 * a bare `TerminalView` directly in App.tsx rather than through
 * `SessionBody`, since it has no forwards or monitor facet of its own to
 * switch to. The `ADR-0064` describe block below checks that this third
 * site exists inside the exact same Sessions-workspace gate as
 * `SessionBody`'s, so the property this file guards, that nothing renders
 * remote output while Home is showing, still holds for it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const srcDir = path.join(here, '..', 'src');
const source = readFileSync(path.join(srcDir, 'App.tsx'), 'utf8');
const sessionBodySource = readFileSync(path.join(srcDir, 'components', 'SessionBody.tsx'), 'utf8');

describe('nothing renders remote output while Home is showing (ADR-0032)', () => {
  it('mounts a SessionBody in exactly one place, and SessionBody mounts exactly one terminal', () => {
    const sessionBodyOccurrences = [...source.matchAll(/<SessionBody\b/g)];
    expect(sessionBodyOccurrences).toHaveLength(1);

    /* Unconditional: no `{... && <TerminalView` inside SessionBody, or the
       gate this file checks around SessionBody's own mount site would stop
       being the thing that decides whether a terminal renders. */
    const terminalViewOccurrences = [...sessionBodySource.matchAll(/<TerminalView\b/g)];
    expect(terminalViewOccurrences).toHaveLength(1);
  });

  it('mounts SessionBody only inside the Sessions workspace branch, before Home\'s own', () => {
    /* ADR-0075 folded the toolbar into one unconditional `<Toolbar>`, so the
       only `workspace === 'sessions'` gate left is the one around the
       `<main>` itself, which also waits out the map preview prompt
       (ADR-0075's `mapPreviewPromptOpen`) so the two never draw at once. */
    const sessionsGate = source.indexOf("{workspace === 'sessions' && !mapPreviewPromptOpen && (\n");
    const homeGate = source.indexOf("        {workspace === 'home' && (");
    const sessionBody = source.indexOf('<SessionBody');

    expect(sessionsGate, 'the Sessions workspace gate').toBeGreaterThan(-1);
    expect(homeGate, "the Home workspace gate").toBeGreaterThan(-1);
    expect(sessionBody, 'the SessionBody mount site').toBeGreaterThan(-1);

    /* Between the two gates, not before either: inside the branch that
       unmounts when `workspace` stops being `'sessions'`, and never reached
       once Home's own branch has opened instead. */
    expect(sessionBody).toBeGreaterThan(sessionsGate);
    expect(sessionBody).toBeLessThan(homeGate);
  });

  it('gates the Sessions branch on workspace and the preview prompt alone, not something narrower', () => {
    /* `macrosOpen` also gates a `workspace === 'sessions'` block, for the
       macros sidebar and not the terminal, and must not be mistaken for the
       one this file is about. Matched literally so a rename of either
       constant is caught here rather than by this test quietly checking
       nothing. */
    const gate = "{workspace === 'sessions' && !mapPreviewPromptOpen && (\n";
    expect(source).toContain(gate);
  });
});

describe('the map is the one other place a terminal mounts (ADR-0064)', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  }

  it('mounts TerminalView in App.tsx, SessionBody.tsx and MapTerminals.tsx, nowhere else', () => {
    const sites = walk(srcDir)
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('TerminalView.tsx'))
      .filter((file) => /<TerminalView\b/.test(readFileSync(file, 'utf8')))
      /* Forward slashes whatever the platform: `path.relative` answers with
         backslashes on Windows, and CI runs there too. */
      .map((file) => path.relative(srcDir, file).split(path.sep).join('/'))
      .sort();
    /* ADR-0077's secondary shell is a bare `TerminalView`, not a
       `SessionBody`: it has no forwards or monitor facet of its own to
       switch to. It is App.tsx's own second mount site, checked below
       against the same Sessions-workspace gate as `SessionBody`'s, so this
       allowlist growing to three is the sanctioned exception, not a widening
       nobody noticed. */
    expect(sites).toEqual(['App.tsx', 'components/SessionBody.tsx', 'components/map/MapTerminals.tsx']);
  });

  it('mounts its App.tsx TerminalView inside the same Sessions-workspace gate as SessionBody (ADR-0077)', () => {
    const sessionsGate = source.indexOf("{workspace === 'sessions' && !mapPreviewPromptOpen && (\n");
    const homeGate = source.indexOf("        {workspace === 'home' && (");
    const secondaryTerminalView = source.indexOf('<TerminalView');

    expect(sessionsGate, 'the Sessions workspace gate').toBeGreaterThan(-1);
    expect(homeGate, 'the Home workspace gate').toBeGreaterThan(-1);
    expect(secondaryTerminalView, 'the secondary-shell TerminalView mount site').toBeGreaterThan(-1);

    expect(secondaryTerminalView).toBeGreaterThan(sessionsGate);
    expect(secondaryTerminalView).toBeLessThan(homeGate);
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
