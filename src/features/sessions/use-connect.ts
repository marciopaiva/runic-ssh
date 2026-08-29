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
  authenticateSession,
  authenticateWithSaved,
  connectSession,
  credentialPrompt,
  disconnectSession,
  dismissCredential,
  dismissHostKey,
  hostKeyDecision as readDecision,
  keepCredentialForRun,
  onInlineCredentialRequest,
  rememberCredential,
  trustHostKey,
} from '../../ipc';
import type {
  HostKeyDecisionView,
  IpcErrorCode,
  Keep,
  Keeping,
  OpenSession,
  Secret,
  SessionHandle,
  SuggestedMethod,
} from '../../ipc';

import { heldDecision, reportedFailure, shouldPromptAfterSaved, shouldTrySaved } from './connect';
import type { ConnectIntent, ConnectStage, ReportedFailure } from './connect';

interface Attempt {
  readonly sessionId: string;
  readonly stage: ConnectStage;
  /** What the attempt is for. Only the ending differs. See `ConnectIntent`. */
  readonly intent: ConnectIntent;
  /** Filled once a decision needs rendering. */
  readonly decision: HostKeyDecisionView | null;
  /**
   * Which credential kind the editor already knows this host takes.
   *
   * ADR-0030. Carried on the attempt, not only passed to the call that opens
   * it, because a host key accepted mid-attempt rebuilds the connection from
   * `trust` below, and the credential window that follows should still open
   * on the kind the editor suggested rather than falling back to the default.
   *
   * `| null` rather than optional: `exactOptionalPropertyTypes` treats the two
   * differently, and every branch that builds an `Attempt` has an answer,
   * `undefined` from a caller included, so it is normalised on the way in
   * rather than left for this type to accept both shapes.
   */
  readonly method: SuggestedMethod | null;
}

interface ConnectState {
  readonly attempt: Attempt | null;
  readonly connect: (
    sessionId: string,
    intent?: ConnectIntent,
    method?: SuggestedMethod,
  ) => Promise<void>;
  /** Accepts the held host key and connects again. */
  readonly trust: (confirmation?: string) => Promise<void>;
  readonly abandon: () => void;
  /**
   * Answers an `'awaitingInline'` attempt with a secret the wizard collected
   * itself. ADR-0032. A no-op outside that stage, the same guard `trust`
   * already keeps against `'deciding'`.
   */
  readonly submitInlineCredential: (secret: Secret, keep: Keep) => Promise<void>;
}

interface Wiring {
  /**
   * Called when a session is open and usable.
   *
   * `via` names the host it is carried on, or `null` when it was reached
   * directly. Reported here rather than read off the saved list later: a jump
   * host taken off a session that is already connected does not close the
   * connection to it, and a sidebar recomputing the fact would stop admitting
   * the host it is still riding. See #168 and `carried.ts`.
   */
  readonly onOpened: (sessionId: string, handle: SessionHandle, via: string | null) => void;
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
   *
   * `via` names the jump host when the refusal happened at that hop, which is
   * a host with no tab of its own. It is reported on the session the user
   * clicked, which is the one they are looking at, the same way a failure in a
   * chain is reported on the session it was on the way to. See #191.
   */
  readonly onCredentialRefused: (sessionId: string, via: string | null) => void;
  /**
   * Called when a credential attempt is over and its connection is closed.
   *
   * The session never became open, so nothing above knows anything changed,
   * and what did change is on disk: the host may now have a credential. The
   * caller reloads on this, which is also what puts the marker in the sidebar
   * back to a plain saved host.
   */
  readonly onCredentialSettled: (sessionId: string) => void;
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
  const {
    onOpened,
    onConnecting,
    onFailed,
    onAbandoned,
    onCredentialRefused,
    onCredentialSettled,
  } = wiring;

  const current = useCallback((mine: number): boolean => generation.current === mine, []);

  const fail = useCallback(
    (
      sessionId: string,
      reported: ReportedFailure,
      mine: number,
      intent: ConnectIntent,
      method?: SuggestedMethod,
    ): void => {
      if (!current(mine)) return;

      const { code, hop } = reported;
      setAttempt({
        sessionId,
        stage: { stage: 'failed', code, hop },
        intent,
        decision: null,
        method: method ?? null,
      });
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
      opened: OpenSession,
      mine: number,
      intent: ConnectIntent,
      method?: SuggestedMethod,
    ): Promise<void> => {
      const { handle } = opened;
      if (!current(mine)) {
        void disconnectSession(handle);
        return;
      }

      /* ADR-0032. The wizard's own proof phase collects the secret itself
         and never opens the credential window at all: `submitInlineCredential`
         picks up from here once its form is answered. No `'authenticating'`
         flash first: that stage means the window is open, which is never
         true on this path. */
      if (intent === 'inline') {
        setAttempt({
          sessionId,
          stage: { stage: 'awaitingInline', handle },
          intent,
          decision: null,
          method: method ?? null,
        });
        return;
      }

      setAttempt({
        sessionId,
        stage: { stage: 'authenticating' },
        intent,
        decision: null,
        method: method ?? null,
      });

      /* A saved credential is tried first and silently. Prompting for a
         password the machine already holds is the reason people stop saving
         them. Not when the point of the attempt is to collect one. */
      if (shouldTrySaved(intent)) {
        try {
          await authenticateWithSaved(handle);
          if (!current(mine)) {
            void disconnectSession(handle);
            return;
          }
          setAttempt(null);
          onOpened(sessionId, handle, opened.via ?? null);
          /* The far host had a saved credential and never opened a window. The
             jump host may still have been asked about and refused on the way
             here. */
          if (opened.keepRefused) onCredentialRefused(sessionId, opened.via ?? null);
          return;
        } catch (rejection) {
          const reported = reportedFailure(asIpcError(rejection) ?? null);
          if (!shouldPromptAfterSaved(reported.code)) {
            /* The connection is open and unusable. Closing it is the only
               way not to leave a socket nobody can reach. */
            void disconnectSession(handle);
            fail(sessionId, reported, mine, intent, method);
            return;
          }
        }
      }

      try {
        /* Only `'open'` ever reaches this call: `'inline'` returned above,
           before `'authenticating'` was even set. ADR-0034 retired the
           intent that used to end here without a terminal. Every caller
           that only wanted a credential collects it inline now, through
           `submitInlineCredential`, which is the only place left that ends
           an attempt on `onCredentialSettled` rather than `onOpened`. */
        const keeping = await authenticateInteractively(handle, method);
        if (!current(mine)) {
          void disconnectSession(handle);
          return;
        }

        setAttempt(null);
        onOpened(sessionId, handle, opened.via ?? null);

        /* After the session is open, never instead of it. Two hops can refuse,
           and the jump host's refusal reaches here on the value that opened the
           session rather than from this call, because it happened before this
           window was ever shown. */
        if (keeping === 'refused') onCredentialRefused(sessionId, null);
        if (opened.keepRefused) onCredentialRefused(sessionId, opened.via ?? null);
      } catch (rejection) {
        void disconnectSession(handle);
        fail(sessionId, reportedFailure(asIpcError(rejection) ?? null), mine, intent, method);
      }
    },
    [fail, onOpened, onCredentialRefused, onCredentialSettled, current],
  );

  const attemptConnect = useCallback(
    /* `continuing` names the decision this attempt is picking up from, and is
       set only by `trust`. A chained session rebuilds the whole chain when a
       key is accepted, so without it the jump host is asked for a second time,
       in the position where the user is expecting the far host's prompt.
       ADR-0027, and #190 for the drive that found it. */
    async (
      sessionId: string,
      intent: ConnectIntent,
      continuing?: number,
      method?: SuggestedMethod,
    ): Promise<void> => {
      generation.current += 1;
      const mine = generation.current;

      setAttempt({
        sessionId,
        stage: { stage: 'connecting' },
        intent,
        decision: null,
        method: method ?? null,
      });
      onConnecting(sessionId);

      /* ADR-0033. Only the wizard's own test ever passes `'inline'`, and
         only it ever needs to hear this: a bastion mid-chain, needing a
         credential nobody saved, with nowhere else to ask for one now that
         the separate window is not going to open. Registered before the
         call it is listening across, so nothing emitted the instant the
         core starts can be missed. */
      const unlisten =
        intent === 'inline'
          ? await onInlineCredentialRequest((request) => {
              if (!current(mine)) return;
              void credentialPrompt(request).then((prompt) => {
                if (!current(mine)) return;
                setAttempt({
                  sessionId,
                  stage: { stage: 'awaitingBastionCredential', request, prompt },
                  intent,
                  decision: null,
                  method: method ?? null,
                });
              });
            })
          : undefined;

      let opened;
      try {
        opened = await connectSession(sessionId, continuing, intent === 'inline');
      } catch (rejection) {
        const error = asIpcError(rejection) ?? null;
        const held = error === null ? null : heldDecision(error);

        if (held === null) {
          fail(sessionId, reportedFailure(error), mine, intent, method);
          return;
        }

        /* The refusal is read back by id rather than from the error: the
           screens want the key type and the port too. */
        try {
          const decision = await readDecision(held.pending);
          if (!current(mine)) return;

          setAttempt({
            sessionId,
            stage: { stage: 'deciding', decision: held },
            intent,
            decision,
            method: method ?? null,
          });
        } catch {
          fail(sessionId, { code: 'unknownDecision', hop: null }, mine, intent, method);
        }
        return;
      } finally {
        unlisten?.();
      }

      await authenticate(sessionId, opened, mine, intent, method);
    },
    [authenticate, fail, onConnecting, current],
  );

  const connect = useCallback(
    async (
      sessionId: string,
      intent: ConnectIntent = 'open',
      method?: SuggestedMethod,
    ): Promise<void> => {
      await attemptConnect(sessionId, intent, undefined, method);
    },
    [attemptConnect],
  );

  const trust = useCallback(
    async (confirmation?: string): Promise<void> => {
      if (attempt === null || attempt.stage.stage !== 'deciding') return;
      const { sessionId, intent, method } = attempt;
      /* `Attempt.method` is `| null`, normalised on the way in; the calls
         below take a parameter that is optional instead, the ordinary shape
         for something most callers never pass. */
      const suggested = method ?? undefined;
      const { pending } = attempt.stage.decision;

      try {
        await trustHostKey(pending, confirmation);
      } catch (rejection) {
        fail(
          sessionId,
          { code: asIpcError(rejection)?.code ?? 'unknownDecision', hop: null },
          generation.current,
          intent,
          suggested,
        );
        return;
      }

      /* Accepting a key means writing it down and connecting again — the
         transport has no "accept for this session" path, deliberately. See
         ssh::connection. The decision is named on the way back in so the chain
         does not ask again for a hop already answered, and the method comes
         with it so a changed key does not lose the kind of credential the
         editor already suggested. */
      await attemptConnect(sessionId, intent, pending, suggested);
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

    /* ADR-0032. There is no window to answer for `'awaitingInline'`. The
       connection itself is what has to be let go, open and unauthenticated,
       or it holds a slot against the server's `MaxSessions` with nothing on
       screen able to reach it again. */
    if (attempt !== null && attempt.stage.stage === 'awaitingInline') {
      void disconnectSession(attempt.stage.handle).catch(() => undefined);
    }

    /* ADR-0033. No window either, for the same reason `awaitingInline` has
       none. There is no connection to let go by hand here, though: the bastion
       connection is held inside the still-running `connect_session` call,
       and dismissing its request is what lets that call unwind on its own,
       closing everything it opened exactly as a dismissed window already
       does today. */
    if (attempt !== null && attempt.stage.stage === 'awaitingBastionCredential') {
      void dismissCredential(attempt.stage.request).catch(() => undefined);
    }

    setAttempt(null);
    if (attempt !== null) onAbandoned(attempt.sessionId);
  }, [attempt, onAbandoned]);

  /**
   * Answers an `'awaitingInline'` attempt. ADR-0032.
   *
   * Authenticates directly against the connection `attemptConnect` already
   * opened and verified the host key for, through `authenticateSession`
   * rather than the credential window's protocol: there is no window here
   * to protocol with. The connection closes either way, because a test is
   * what this is, never a session left open for a terminal nobody asked to
   * see. The same ending the retired `'credential'` intent used to reach
   * through the window instead. ADR-0034.
   */
  const submitInlineCredential = useCallback(
    async (secret: Secret, keep: Keep): Promise<void> => {
      if (attempt === null || attempt.stage.stage !== 'awaitingInline') return;
      const { sessionId, intent, method } = attempt;
      const { handle } = attempt.stage;
      const mine = generation.current;

      try {
        await authenticateSession(handle, secret);
      } catch (rejection) {
        if (!current(mine)) return;
        void disconnectSession(handle);
        fail(sessionId, reportedFailure(asIpcError(rejection) ?? null), mine, intent, method ?? undefined);
        return;
      }

      if (!current(mine)) {
        void disconnectSession(handle);
        return;
      }

      /* Encoded as `Keeping` to reuse the same settled surface `authenticate`
         already renders for the credential window's path. The endings agree
         on what to say, only how the secret got there differs. */
      let keeping: Keeping = 'notAsked';
      if (keep !== 'never') {
        try {
          if (keep === 'forThisRun') await keepCredentialForRun(sessionId, secret);
          else await rememberCredential(sessionId, secret);
          keeping = 'kept';
        } catch {
          keeping = 'refused';
        }
      }

      void disconnectSession(handle);
      setAttempt({
        sessionId,
        stage: { stage: 'settled', keeping },
        intent,
        decision: null,
        method,
      });
      onCredentialSettled(sessionId);
    },
    [attempt, fail, onCredentialSettled, current],
  );

  return { attempt, connect, trust, abandon, submitInlineCredential };
}
