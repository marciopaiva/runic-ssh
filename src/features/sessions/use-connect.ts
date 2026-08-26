/**
 * Taking a saved host to an open session.
 *
 * The order here is the security-critical part, and `connect.ts` holds the
 * rules it follows. A host key decision always precedes a credential: a
 * password typed at an unverified host is a password given to whoever
 * answered.
 *
 * Every attempt ends in exactly one place — connected, cancelled, or failed
 * with a code. There is no path that leaves a session in `connecting` forever,
 * because that reads as the application having hung rather than as an error.
 */

import { useCallback, useRef, useState } from 'react';

import {
  asIpcError,
  authenticateInteractively,
  authenticateWithSaved,
  connectSession,
  disconnectSession,
  dismissCredential,
  dismissHostKey,
  hostKeyDecision as readDecision,
  trustHostKey,
} from '../../ipc';
import type { HostKeyDecisionView, IpcErrorCode, SessionHandle } from '../../ipc';

import { heldDecision, reportedFailure, shouldPromptAfterSaved, shouldTrySaved } from './connect';
import type { ConnectStage, ReportedFailure } from './connect';

interface Attempt {
  readonly sessionId: string;
  readonly stage: ConnectStage;
  /** Filled once a decision needs rendering. */
  readonly decision: HostKeyDecisionView | null;
}

interface ConnectState {
  readonly attempt: Attempt | null;
  readonly connect: (sessionId: string) => Promise<void>;
  /** Accepts the held host key and connects again. */
  readonly trust: (confirmation?: string) => Promise<void>;
  readonly abandon: () => void;
}

interface Wiring {
  readonly onOpened: (sessionId: string, handle: SessionHandle) => void;
  readonly onConnecting: (sessionId: string) => void;
  readonly onFailed: (sessionId: string, code: IpcErrorCode) => void;
  /**
   * Called when an attempt is let go without an answer.
   *
   * The session has to stop saying `connecting`, and only the caller knows
   * what it was before. Without this the marker keeps its amber halo and
   * `openTabs` keeps handing it a tab, so cancelling looked like nothing
   * happened — found by cancelling a connection to a host that swallows the
   * SYN, where the state is visible for the two minutes it takes to fail.
   */
  readonly onAbandoned: (sessionId: string) => void;
  /**
   * Called when the user asked to keep a credential and the store refused.
   *
   * Never a failure: the session is open and usable, and only the convenience
   * did not happen. But it is said, because a tick box that does nothing and
   * says nothing is worse than one that is not offered at all. See #167.
   */
  readonly onCredentialRefused: (sessionId: string) => void;
}

export function useConnect(wiring: Wiring): ConnectState {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  /* Which attempt the answers still belong to.
   *
   * Nothing here can cancel an `await` that is already in flight — the core has
   * no abort for a connect, and a TCP connect to a host that does not answer
   * runs for about two minutes whatever the interface does. What abandoning
   * *can* guarantee is that the answer, when it finally arrives, is thrown away
   * instead of reopening a panel the user closed, or marking a session failed
   * that they already walked away from.
   *
   * A connection that opens after being abandoned is closed rather than kept:
   * it has no tab, so nothing could ever reach it, and leaving it open holds a
   * channel on the server that nobody can see. */
  const generation = useRef(0);
  const { onOpened, onConnecting, onFailed, onAbandoned, onCredentialRefused } = wiring;

  const current = useCallback((mine: number): boolean => generation.current === mine, []);

  const fail = useCallback(
    (sessionId: string, reported: ReportedFailure, mine: number): void => {
      if (!current(mine)) return;

      const { code, hop } = reported;
      setAttempt({ sessionId, stage: { stage: 'failed', code, hop }, decision: null });
      /* The state machine sees the inner code, so a bastion that cannot be
         reached still marks the session unreachable. It is: the host cannot be
         reached, and the reason is one hop further away than usual. */
      onFailed(sessionId, code);
    },
    [onFailed, current],
  );

  const authenticate = useCallback(
    async (
      sessionId: string,
      handle: SessionHandle,
      mine: number,
    ): Promise<void> => {
      if (!current(mine)) {
        void disconnectSession(handle);
        return;
      }

      setAttempt({ sessionId, stage: { stage: 'authenticating' }, decision: null });

      /* A saved credential is tried first and silently. Prompting for a
         password the machine already holds is the reason people stop saving
         them. */
      if (shouldTrySaved()) {
        try {
          await authenticateWithSaved(handle);
          if (!current(mine)) {
            void disconnectSession(handle);
            return;
          }
          setAttempt(null);
          onOpened(sessionId, handle);
          return;
        } catch (rejection) {
          const reported = reportedFailure(asIpcError(rejection) ?? null);
          if (!shouldPromptAfterSaved(reported.code)) {
            /* The connection is open and unusable. Closing it is the only
               way not to leave a socket nobody can reach. */
            void disconnectSession(handle);
            fail(sessionId, reported, mine);
            return;
          }
        }
      }

      try {
        const keeping = await authenticateInteractively(handle);
        if (!current(mine)) {
          void disconnectSession(handle);
          return;
        }
        setAttempt(null);
        onOpened(sessionId, handle);
        /* After the session is open, never instead of it. */
        if (keeping === 'refused') onCredentialRefused(sessionId);
      } catch (rejection) {
        void disconnectSession(handle);
        fail(sessionId, reportedFailure(asIpcError(rejection) ?? null), mine);
      }
    },
    [fail, onOpened, onCredentialRefused, current],
  );

  const attemptConnect = useCallback(
    /* `continuing` names the decision this attempt is picking up from, and is
       set only by `trust`. A chained session rebuilds the whole chain when a
       key is accepted, so without it the jump host is asked for a second time,
       in the position where the user is expecting the far host's prompt.
       ADR-0027, and #190 for the drive that found it. */
    async (sessionId: string, continuing?: number): Promise<void> => {
      generation.current += 1;
      const mine = generation.current;

      setAttempt({ sessionId, stage: { stage: 'connecting' }, decision: null });
      onConnecting(sessionId);

      let opened;
      try {
        opened = await connectSession(sessionId, continuing);
      } catch (rejection) {
        const error = asIpcError(rejection) ?? null;
        const held = error === null ? null : heldDecision(error);

        if (held === null) {
          fail(sessionId, reportedFailure(error), mine);
          return;
        }

        /* The refusal is read back by id rather than from the error: the
           screens want the key type and the port too. */
        try {
          const decision = await readDecision(held.pending);
          if (!current(mine)) return;

          setAttempt({ sessionId, stage: { stage: 'deciding', decision: held }, decision });
        } catch {
          fail(sessionId, { code: 'unknownDecision', hop: null }, mine);
        }
        return;
      }

      await authenticate(sessionId, opened.handle, mine);
    },
    [authenticate, fail, onConnecting, current],
  );

  const connect = useCallback(
    async (sessionId: string): Promise<void> => {
      await attemptConnect(sessionId);
    },
    [attemptConnect],
  );

  const trust = useCallback(
    async (confirmation?: string): Promise<void> => {
      if (attempt === null || attempt.stage.stage !== 'deciding') return;
      const { sessionId } = attempt;
      const { pending } = attempt.stage.decision;

      try {
        await trustHostKey(pending, confirmation);
      } catch (rejection) {
        fail(
          sessionId,
          { code: asIpcError(rejection)?.code ?? 'unknownDecision', hop: null },
          generation.current,
        );
        return;
      }

      /* Accepting a key means writing it down and connecting again — the
         transport has no "accept for this session" path, deliberately. See
         ssh::connection. The decision is named on the way back in so the chain
         does not ask again for a hop already answered. */
      await attemptConnect(sessionId, pending);
    },
    [attempt, attemptConnect, fail],
  );

  /* Bumping the generation is what makes this a cancel rather than a hide: any
     answer still in flight now belongs to nobody and is dropped on arrival. */
  const abandon = useCallback((): void => {
    generation.current += 1;

    /* Told to the core as well as forgotten here. A decision left behind may be
       holding the credential typed for a jump host, and a secret the user asked
       us not to keep must not outlive the attempt they walked away from. The
       rejection is swallowed on purpose: cancelling has already happened as far
       as the user is concerned, and there is nothing for them to do about a
       tidy-up that failed. */
    if (attempt !== null && attempt.stage.stage === 'deciding') {
      void dismissHostKey(attempt.stage.decision.pending).catch(() => undefined);
    }

    /* And the prompt window goes with it. Cancelling used to leave it standing:
       the panel went back to normal and a password prompt stayed on top of
       everything, asking for a connection that no longer existed, with the core
       still waiting inside it. Somebody who typed into it was authenticating an
       attempt they had already walked away from.

       No request id is needed. Closing the window is what answers the request,
       because the core wires its destruction to a dismissal. #193.

       This is also the way out of a prompt whose own script never loaded, which
       is what ADR-0028 spends to take the native title bar off that window. It
       is a different document with a different script, so it survives the
       failure the title bar was there for. */
    if (attempt !== null && attempt.stage.stage === 'authenticating') {
      void dismissCredential(null).catch(() => undefined);
    }

    setAttempt(null);
    if (attempt !== null) onAbandoned(attempt.sessionId);
  }, [attempt, onAbandoned]);

  return { attempt, connect, trust, abandon };
}
