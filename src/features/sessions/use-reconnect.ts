/**
 * Drives the retries of a dropped session (ADR-0079).
 *
 * One timer per session, and every timer has a way out: `cancel` clears it and
 * drops a quiet attempt in flight, and unmounting does the same for all of them.
 * A retry loop that outlived the window it serves would keep logging in to a
 * host nobody is looking at (CLAUDE.md section 6).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FailureCode } from './connect';
import { MAX_ATTEMPTS, backoffMs, classify } from './reconnect';
import type { ReconnectView, StopReason } from './reconnect';
import type { QuietOutcome } from './use-connect';

interface Quiet {
  readonly reconnectQuietly: (sessionId: string) => Promise<QuietOutcome>;
  readonly cancelQuiet: (sessionId: string) => void;
}

interface Reconnects {
  readonly views: ReadonlyMap<string, ReconnectView>;
  /** Starts retrying a session whose connection was lost. A no-op while it is
      already retrying. */
  readonly begin: (sessionId: string) => void;
  /** Starts over from the first attempt, after the person asked. */
  readonly retry: (sessionId: string) => void;
  /** Stops retrying and forgets it. */
  readonly cancel: (sessionId: string) => void;
}

/** What the Logbook is told about a retry loop. */
export type ReconnectStep =
  | { readonly kind: 'dropped' }
  | { readonly kind: 'reconnecting'; readonly attempt: number }
  | { readonly kind: 'reconnected' };

export function useReconnect(
  quiet: Quiet,
  /** Called once when retrying stops by itself, with the last failure. */
  onStopped: (sessionId: string, reason: StopReason, code: FailureCode | null) => void,
  /** Told of each step, for the Logbook (ADR-0081). Carries a session id and a
      kind, never a reason or a message. */
  onStep: (sessionId: string, step: ReconnectStep) => void = () => undefined,
): Reconnects {
  const [views, setViews] = useState<ReadonlyMap<string, ReconnectView>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  /* Read through refs so a re-render never restarts a timer in flight. */
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  const stoppedRef = useRef(onStopped);
  stoppedRef.current = onStopped;
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  const show = useCallback((sessionId: string, view: ReconnectView | null): void => {
    setViews((current) => {
      const next = new Map(current);
      if (view === null) next.delete(sessionId);
      else next.set(sessionId, view);
      return next;
    });
  }, []);

  const schedule = useCallback(
    (sessionId: string, attempt: number): void => {
      show(sessionId, { phase: 'waiting', attempt });

      const timer = setTimeout(() => {
        timers.current.delete(sessionId);
        show(sessionId, { phase: 'trying', attempt });
        stepRef.current(sessionId, { kind: 'reconnecting', attempt });

        void quietRef.current.reconnectQuietly(sessionId).then((outcome) => {
          if (outcome.ok) {
            show(sessionId, null);
            stepRef.current(sessionId, { kind: 'reconnected' });
            return;
          }
          if (outcome.cancelled) return;

          const verdict = classify(outcome.code, outcome.held);
          if (verdict === 'retry' && attempt < MAX_ATTEMPTS) {
            schedule(sessionId, attempt + 1);
            return;
          }

          const reason: StopReason = verdict === 'retry' ? 'exhausted' : verdict;
          show(sessionId, { phase: 'stopped', reason });
          stoppedRef.current(sessionId, reason, outcome.code);
        });
      }, backoffMs(attempt));

      timers.current.set(sessionId, timer);
    },
    [show],
  );

  const cancel = useCallback(
    (sessionId: string): void => {
      const timer = timers.current.get(sessionId);
      if (timer !== undefined) clearTimeout(timer);
      timers.current.delete(sessionId);
      quietRef.current.cancelQuiet(sessionId);
      show(sessionId, null);
    },
    [show],
  );

  const begin = useCallback(
    (sessionId: string): void => {
      const view = views.get(sessionId);
      if (view !== undefined && view.phase !== 'stopped') return;
      stepRef.current(sessionId, { kind: 'dropped' });
      schedule(sessionId, 1);
    },
    [schedule, views],
  );

  const retry = useCallback(
    (sessionId: string): void => {
      cancel(sessionId);
      schedule(sessionId, 1);
    },
    [cancel, schedule],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const [sessionId, timer] of pending) {
        clearTimeout(timer);
        quietRef.current.cancelQuiet(sessionId);
      }
      pending.clear();
    };
  }, []);

  return { views, begin, retry, cancel };
}
