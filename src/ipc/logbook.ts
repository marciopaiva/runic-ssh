/**
 * Typed wrapper over the Logbook commands (ADR-0081).
 *
 * The Logbook is what happened to a host, kept on this machine. An event has a
 * time and one of a closed set of kinds, and none of them carries text a person
 * typed, host output or a secret. The core writes most of them itself; the
 * interface reports only what it alone sees, a drop and the reconnect after it,
 * and the core refuses anything else.
 */

import { invoke } from '@tauri-apps/api/core';

export type LogbookOutcome = 'ran' | 'timedOut' | 'failed';

export type LogbookKind =
  | { readonly kind: 'connected' }
  | { readonly kind: 'dropped' }
  | { readonly kind: 'reconnecting'; readonly attempt: number }
  | { readonly kind: 'reconnected' }
  | { readonly kind: 'hostKeyTrusted'; readonly fingerprint: string; readonly replaced: boolean }
  | {
      readonly kind: 'macroRun';
      readonly name: string;
      readonly outcome: LogbookOutcome;
      readonly exitStatus: number | null;
    };

/** One entry. `at` is milliseconds since the Unix epoch. */
export type LogbookEvent = { readonly at: number } & LogbookKind;

/** What the interface may report. The core refuses every other kind. */
export type ReportedEvent =
  | { readonly kind: 'dropped' }
  | { readonly kind: 'reconnecting'; readonly attempt: number }
  | { readonly kind: 'reconnected' };

/** A host's events, oldest first. */
export async function readLogbook(sessionId: string): Promise<readonly LogbookEvent[]> {
  return invoke<LogbookEvent[]>('read_logbook', { sessionId });
}

/** Forgets everything recorded for one host. */
export async function clearLogbook(sessionId: string): Promise<void> {
  return invoke<void>('clear_logbook', { sessionId });
}

export async function reportLogbook(sessionId: string, event: ReportedEvent): Promise<void> {
  return invoke<void>('report_logbook', { sessionId, event });
}
