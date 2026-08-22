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

import { useCallback, useState } from 'react';

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
}

export function useConnect(wiring: Wiring): ConnectState {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const { onOpened, onConnecting, onFailed } = wiring;

  const fail = useCallback(
    (sessionId: string, code: IpcErrorCode): void => {
      setAttempt({ sessionId, stage: { stage: 'failed', code }, decision: null });
      onFailed(sessionId, code);
    },
    [onFailed],
  );

  const authenticate = useCallback(
    async (sessionId: string, handle: SessionHandle, credentialId: string | null): Promise<void> => {
      setAttempt({ sessionId, stage: { stage: 'authenticating' }, decision: null });

      /* A saved credential is tried first and silently. Prompting for a
         password the machine already holds is the reason people stop saving
         them. */
      if (shouldTrySaved(credentialId)) {
        try {
          await authenticateWithSaved(handle);
          setAttempt(null);
          onOpened(sessionId, handle);
          return;
        } catch (rejection) {
          const code = asIpcError(rejection)?.code ?? 'sshTransport';
          if (!shouldPromptAfterSaved(code)) {
            /* The connection is open and unusable. Closing it is the only
               way not to leave a socket nobody can reach. */
            void disconnectSession(handle);
            fail(sessionId, code);
            return;
          }
        }
      }

      try {
        await authenticateInteractively(handle);
        setAttempt(null);
        onOpened(sessionId, handle);
      } catch (rejection) {
        void disconnectSession(handle);
        fail(sessionId, asIpcError(rejection)?.code ?? 'sshTransport');
      }
    },
    [fail, onOpened],
  );

  const attemptConnect = useCallback(
    async (sessionId: string, credentialId: string | null): Promise<void> => {
      setAttempt({ sessionId, stage: { stage: 'connecting' }, decision: null });
      onConnecting(sessionId);

      let opened;
      try {
        opened = await connectSession(sessionId);
      } catch (rejection) {
        const error = asIpcError(rejection) ?? null;
        const held = error === null ? null : heldDecision(error);

        if (held === null) {
          fail(sessionId, error?.code ?? 'sshTransport');
          return;
        }

        /* The refusal is read back by id rather than from the error: the
           screens want the key type and the port too. */
        try {
          setAttempt({
            sessionId,
            stage: { stage: 'deciding', decision: held },
            decision: await readDecision(held.pending),
          });
        } catch {
          fail(sessionId, 'unknownDecision');
        }
        return;
      }

      await authenticate(sessionId, opened.handle, credentialId);
    },
    [authenticate, fail, onConnecting],
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
        fail(sessionId, asIpcError(rejection)?.code ?? 'unknownDecision');
        return;
      }

      /* Accepting a key means writing it down and connecting again — the
         transport has no "accept for this session" path, deliberately. See
         ssh::connection. */
      await attemptConnect(sessionId, null);
    },
    [attempt, attemptConnect, fail],
  );

  const abandon = useCallback((): void => setAttempt(null), []);

  return { attempt, connect, trust, abandon };
}
