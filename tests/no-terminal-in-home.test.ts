/**
 * Guards the premise ADR-0032 rests on.
 *
 * The wizard's own inline credential field (`InlineCredentialForm`) lives in
 * the same document as the terminal, which is exactly what ADR-0008
 * refused to do — unless nothing renders remote output while the field is
 * on screen. ADR-0032 checked that and found it true: every `TerminalView`
 * is mounted inside `{workspace === 'sessions' && (...)}`, a plain
 * conditional, so switching to Home unmounts every one of them rather than
 * hiding them the way switching tabs *within* Sessions does (ADR-0014).
 *
 * That is a runtime condition, not a structural one — nothing like the
 * separate bundle `tests/credential-window.test.ts` checks for the
 * credential window. This is the equivalent floor for the wizard's inline
 * field: a change that widens the gate, or adds a second `TerminalView`
 * mount site outside it, fails here rather than silently reopening what
 * ADR-0032 relied on.
 */

import { readFileSync } from 'node:fs';
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
    const homeGate = source.indexOf("{workspace === 'home' && (");
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
    /* `sidebarOpen` also gates a `workspace === 'sessions'` block — the
       sidebar, not the terminal — and must not be mistaken for the one this
       file is about. Matched literally so a rename of either constant is
       caught here rather than by this test quietly checking nothing. */
    const gate = "{workspace === 'sessions' && (\n";
    expect(source).toContain(gate);
  });
});
