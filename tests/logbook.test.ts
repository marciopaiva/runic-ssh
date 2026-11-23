/**
 * Guards what a Logbook line says, and that the interface can only report what
 * only it sees (ADR-0081).
 *
 * The rule worth a test is the tone: a loss, a replaced key, a failed or
 * non-zero macro read as warnings, and a clean run does not, so a person
 * scanning a host's history finds what went wrong without reading every line.
 */

import { describe, expect, it } from 'vitest';

import { describeEvent } from '../src/features/sessions/logbook';
import type { LogbookEvent } from '../src/ipc';
import { createTranslator } from '../src/lib/i18n';

const i18n = createTranslator('en');
const at = 1_700_000_000_000;

function line(event: Omit<LogbookEvent, 'at'> & Record<string, unknown>): { text: string; tone: string } {
  return describeEvent({ at, ...event } as LogbookEvent, i18n);
}

describe('a Logbook line', () => {
  it('says what happened in each kind', () => {
    expect(line({ kind: 'connected' }).text).toBe('Connected');
    expect(line({ kind: 'dropped' }).text).toBe('Connection lost');
    expect(line({ kind: 'reconnecting', attempt: 3 }).text).toBe('Reconnecting, attempt 3');
    expect(line({ kind: 'reconnected' }).text).toBe('Reconnected');
    expect(line({ kind: 'hostKeyTrusted', fingerprint: 'SHA256:abc', replaced: false }).text).toBe(
      'Server key accepted: SHA256:abc',
    );
    expect(line({ kind: 'hostKeyTrusted', fingerprint: 'SHA256:abc', replaced: true }).text).toBe(
      'Server key replaced by SHA256:abc',
    );
  });

  it('says how a macro ended', () => {
    const run = (outcome: string, exitStatus: number | null): { text: string; tone: string } =>
      line({ kind: 'macroRun', name: 'check', outcome, exitStatus });
    expect(run('ran', 0).text).toBe('Macro check ran, exit status 0');
    expect(run('ran', null).text).toBe('Macro check ran');
    expect(run('timedOut', null).text).toBe('Macro check timed out');
    expect(run('failed', null).text).toBe('Macro check could not run');
  });

  it('marks a loss, a replaced key and a failure as warnings, and a clean run as not', () => {
    expect(line({ kind: 'dropped' }).tone).toBe('warn');
    expect(line({ kind: 'hostKeyTrusted', fingerprint: 'x', replaced: true }).tone).toBe('warn');
    expect(line({ kind: 'hostKeyTrusted', fingerprint: 'x', replaced: false }).tone).toBe('plain');
    expect(line({ kind: 'macroRun', name: 'a', outcome: 'ran', exitStatus: 1 }).tone).toBe('warn');
    expect(line({ kind: 'macroRun', name: 'a', outcome: 'ran', exitStatus: 0 }).tone).toBe('plain');
    expect(line({ kind: 'macroRun', name: 'a', outcome: 'timedOut', exitStatus: null }).tone).toBe('warn');
    expect(line({ kind: 'connected' }).tone).toBe('plain');
    expect(line({ kind: 'reconnected' }).tone).toBe('plain');
  });
});
