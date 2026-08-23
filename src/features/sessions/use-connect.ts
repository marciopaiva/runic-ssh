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
  hostKeyDecision as readDecision,
  trustHostKey,
} from '../../ipc';
import type { HostKeyDecisionView, IpcErrorCode, SessionHandle } from '../../ipc';

import { heldDecision, shouldPromptAfterSaved, shouldTrySaved } from './connect';
import type { ConnectStage } from './connect';

interface Attempt {
  readonly sessionId: string;
  readonly stage: ConnectStage;
  /** Filled once a decision needs rendering. */
  readonly decision: HostKeyDecisionView | null;
}

interface ConnectState {
  readonly attempt: Attempt | null;
  readonly connect: (sessionId: string, credentialId: string | null) => Promise<void>;
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
  const { onOpened, onConnecting, onFailed, onAbandoned } = wiring;

  const current = useCallback((mine: number): boolean => generation.current === mine, []);

  const fail = useCallback(
    (sessionId: string, code: IpcErrorCode, mine: number): void => {
      if (!current(mine)) return;

      setAttempt({ sessionId, stage: { stage: 'failed', code }, decision: null });
      onFailed(sessionId, code);
    },
    [onFailed, current],
  );

  const authenticate = useCallback(
    async (
      sessionId: string,
      handle: SessionHandle,
      credentialId: string | null,
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
      if (shouldTrySaved(credentialId)) {
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
          const code = asIpcError(rejection)?.code ?? 'sshTransport';
          if (!shouldPromptAfterSaved(code)) {
            /* The connection is open and unusable. Closing it is the only
               way not to leave a socket nobody can reach. */
            void disconnectSession(handle);
            fail(sessionId, code, mine);
            return;
          }
        }
      }

      try {
        await authenticateInteractively(handle);
        if (!current(mine)) {
          void disconnectSession(handle);
          return;
        }
        setAttempt(null);
        onOpened(sessionId, handle);
      } catch (rejection) {
        void disconnectSession(handle);
        fail(sessionId, asIpcError(rejection)?.code ?? 'sshTransport', mine);
      }
    },
    [fail, onOpened, current],
  );

  const attemptConnect = useCallback(
    async (sessionId: string, credentialId: string | null): Promise<void> => {
      generation.current += 1;
      const mine = generation.current;

      setAttempt({ sessionId, stage: { stage: 'connecting' }, decision: null });
      onConnecting(sessionId);

      let opened;
      try {
        opened = await connectSession(sessionId);
      } catch (rejection) {
        const error = asIpcError(rejection) ?? null;
        const held = error === null ? null : heldDecision(error);

        if (held === null) {
          fail(sessionId, error?.code ?? 'sshTransport', mine);
          return;
        }

        /* The refusal is read back by id rather than from the error: the
           screens want the key type and the port too. */
        try {
          const decision = await readDecision(held.pending);
          if (!current(mine)) return;

          setAttempt({ sessionId, stage: { stage: 'deciding', decision: held }, decision });
        } catch {
          fail(sessionId, 'unknownDecision', mine);
        }
        return;
      }

      await authenticate(sessionId, opened.handle, credentialId, mine);
    },
    [authenticate, fail, onConnecting, current],
  );

  const connect = useCallback(
    async (sessionId: string, credentialId: string | null): Promise<void> => {
      await attemptConnect(sessionId, credentialId);
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
        fail(sessionId, asIpcError(rejection)?.code ?? 'unknownDecision', generation.current);
        return;
      }

      /* Accepting a key means writing it down and connecting again — the
         transport has no "accept for this session" path, deliberately. See
         ssh::connection. */
      await attemptConnect(sessionId, null);
    },
    [attempt, attemptConnect, fail],
  );

  /* Bumping the generation is what makes this a cancel rather than a hide: any
     answer still in flight now belongs to nobody and is dropped on arrival. */
  const abandon = useCallback((): void => {
    generation.current += 1;
    setAttempt(null);
    if (attempt !== null) onAbandoned(attempt.sessionId);
  }, [attempt, onAbandoned]);

  return { attempt, connect, trust, abandon };
}
