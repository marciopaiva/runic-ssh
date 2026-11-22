/**
 * The rules of reconnecting a dropped session (ADR-0079).
 *
 * Pure, so the schedule and the decision of when to stop can be asserted
 * without timers or a network. What this pins down is that **only a failure to
 * reach the host is retried**. A refused credential, a changed or unknown host
 * key and a missing credential all stop the loop: retrying them is either
 * useless or, for a credential the host keeps rejecting, how an account gets
 * locked.
 */

import { shouldPromptAfterSaved } from './connect';
import type { FailureCode } from './connect';

/** How many times a reconnect tries before leaving it to the person. */
export const MAX_ATTEMPTS = 8;

const FIRST_DELAY_MS = 1000;
const CEILING_MS = 30_000;

/**
 * How long to wait before attempt `attempt` (1 for the first): 1 s, 2 s, 4 s,
 * 8 s, 16 s, then 30 s.
 */
export function backoffMs(attempt: number): number {
  const steps = Math.max(0, attempt - 1);
  return Math.min(FIRST_DELAY_MS * 2 ** steps, CEILING_MS);
}

/** Why a reconnect stopped retrying by itself. */
export type StopReason =
  /** Nothing saved covers this host, so it has to be asked for. */
  | 'credential'
  /** The host key is unknown, changed or refused: a decision for the person. */
  | 'hostKey'
  /** The saved credential was tried and the host said no. */
  | 'rejected'
  /** Something not worth retrying blind. */
  | 'other'
  /** Every attempt was used. */
  | 'exhausted';

/**
 * What to do about one failed attempt: try again, or stop and why.
 *
 * `held` is a host key decision the core is waiting on.
 */
export function classify(code: FailureCode, held: boolean): 'retry' | Exclude<StopReason, 'exhausted'> {
  if (held) return 'hostKey';

  switch (code) {
    case 'hostUnreachable':
    case 'connectTimedOut':
    case 'sshTransport':
      return 'retry';
    case 'hostKeyRejected':
    case 'hostKeyDecision':
    case 'hostKeyRevoked':
    case 'hostKeyCertificateRequired':
      return 'hostKey';
    case 'authenticationFailed':
      return 'rejected';
    default:
      return shouldPromptAfterSaved(code) ? 'credential' : 'other';
  }
}

/** What the terminal's banner needs to say about a session's reconnect. */
export type ReconnectView =
  | { readonly phase: 'waiting'; readonly attempt: number }
  | { readonly phase: 'trying'; readonly attempt: number }
  | { readonly phase: 'stopped'; readonly reason: StopReason };
