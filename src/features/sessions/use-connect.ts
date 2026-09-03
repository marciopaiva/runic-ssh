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
  Hop,
  Keep,
  Keeping,
  OpenSession,
  Secret,
  SessionHandle,
  SuggestedMethod,
} from '../../ipc';

import { heldDecision, reportedFailure, shouldPromptAfterSaved } from './connect';
import type { ConnectIntent, ConnectStage, FailureCode, ReportedFailure } from './connect';

/** How long registering to hear a bastion's own inline credential request
    (`onInlineCredentialRequest`) may take before an `'inline'` attempt gives
    up on it. Matches `ssh/connection.rs`'s own `CONNECT_TIMEOUT`: this is
    local IPC rather than a network call, but the same reasoning applies.
    Both land far inside the point where a person decides the application
    has hung. */
const INLINE_LISTENER_TIMEOUT_MS = 20_000;

/**
 * A secret the wizard's own Access section already collected, ADR-0057.
 * Carried as a plain value through `connect`/`attemptConnect`/`authenticate`,
 * never `useState` and never a component prop: the same discipline
 * `InlineCredentialForm.tsx` already keeps for the bastion's own case.
 */
interface PreCollectedCredential {
  readonly secret: Secret;
  readonly keep: Keep;
}

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
  /**
   * A secret the wizard's own Access section already collected, ADR-0057.
   * Carried on the attempt for the same reason `method` is: a host key
   * accepted mid-attempt rebuilds the connection through `trust`, and the
   * credential typed before Save has to survive that rebuild rather than
   * being asked for twice. `null` for `'open'`, and for `'inline'` when a
   * stored or kept credential already covers this host and there was
   * nothing to read from the form.
   */
  readonly credential: PreCollectedCredential | null;
}

interface ConnectState {
  readonly attempt: Attempt | null;
  readonly connect: (
    sessionId: string,
    intent?: ConnectIntent,
    method?: SuggestedMethod,
    credential?: PreCollectedCredential | null,
  ) => Promise<void>;
  /** Accepts the held host key and connects again. */
  readonly trust: (confirmation?: string) => Promise<void>;
  readonly abandon: () => void;
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
  readonly onFailed: (sessionId: string, code: FailureCode) => void;
  /**
   * Called when an attempt is let go, answered or not.
   *
   * The session has to stop saying `connecting`, and only the caller knows
   * what it was before. Without this the marker keeps its amber halo and
   * `openTabs` keeps handing it a tab, so cancelling looked like nothing
   * happened — found by cancelling a connection to a host that swallows the
   * SYN, where the state is visible for the two minutes it takes to fail.
   *
   * `settled` says which kind of letting go this is: `CredentialSaved` and
   * `ConnectionFailure` both dismiss through this same call, exactly like a
   * cancelled host key prompt does, and only `settled` tells the two apart.
   * True means the attempt already had an answer when it was let go; false
   * means it was walked away from with none, the case the doc above names.
   */
  readonly onAbandoned: (sessionId: string, settled: boolean) => void;
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
  /**
   * Called when an ordinary connect finds nothing usable saved, for the
   * session itself or for the bastion it is carried on. ADR-0039: there is
   * nowhere left in Sessions to collect one, so the caller sends the user to
   * that host's own wizard entry instead. `hop` says which saved session
   * that is: the one clicked, or the bastion it names.
   */
  readonly onCredentialMissing: (sessionId: string, hop: Hop) => void;
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
    onCredentialMissing,
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
        credential: null,
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
      credential?: PreCollectedCredential | null,
    ): Promise<void> => {
      const { handle } = opened;
      if (!current(mine)) {
        void disconnectSession(handle);
        return;
      }

      setAttempt({
        sessionId,
        stage: { stage: 'connecting' },
        intent,
        decision: null,
        method: method ?? null,
        credential: credential ?? null,
      });

      /* ADR-0057. A secret the wizard's own Access section already
         collected authenticates directly, the same command the retired
         `submitInlineCredential` used to call from a second screen. The
         connection this attempt opened is closed either way once the
         answer is known: a test is what this is, never a session left open
         for a terminal nobody asked to see. ADR-0034. */
      if (intent === 'inline' && credential) {
        try {
          await authenticateSession(handle, credential.secret);
        } catch (rejection) {
          if (!current(mine)) return;
          void disconnectSession(handle);
          fail(sessionId, reportedFailure(asIpcError(rejection) ?? null), mine, intent, method);
          return;
        }

        if (!current(mine)) {
          void disconnectSession(handle);
          return;
        }

        /* Encoded as `Keeping` (ADR-0008's own three endings), the shape
           `CredentialSaved` already knows how to render. */
        let keeping: Keeping = 'notAsked';
        if (credential.keep !== 'never') {
          try {
            if (credential.keep === 'forThisRun') await keepCredentialForRun(sessionId, credential.secret);
            else await rememberCredential(sessionId, credential.secret);
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
          method: method ?? null,
          credential: null,
        });
        onCredentialSettled(sessionId);
        return;
      }

      /* A saved credential is tried first and silently. Reached by `'open'`
         always, and by `'inline'` exactly when a stored or kept credential
         already covers this host, ADR-0036's own `skipTest` case: there was
         nothing to read off the Access section, since it never rendered a
         field for this host to begin with. */
      try {
        await authenticateWithSaved(handle);
        if (!current(mine)) {
          void disconnectSession(handle);
          return;
        }
        setAttempt(null);
        onOpened(sessionId, handle, opened.via ?? null);
        /* The far host had a saved credential. The jump host may still have
           been asked about and refused on the way here. */
        if (opened.keepRefused) onCredentialRefused(sessionId, opened.via ?? null);
      } catch (rejection) {
        const reported = reportedFailure(asIpcError(rejection) ?? null);
        /* The connection is open and unusable either way. Closing it is the
           only way not to leave a socket nobody can reach. */
        void disconnectSession(handle);
        if (!current(mine)) return;

        /* ADR-0039: nothing usable was saved, and there is nowhere left in
           Sessions to collect one. The wizard on this host's own entry is.
           Only `'open'` redirects there: `'inline'` is already on that
           entry, mid-test, and a stale stored credential (host changed
           since it was saved) is reported as an ordinary failure instead,
           landing back on the same form to retype. */
        if (intent === 'open' && shouldPromptAfterSaved(reported.code)) {
          onCredentialMissing(sessionId, 'target');
          return;
        }

        fail(sessionId, reported, mine, intent, method);
      }
    },
    [fail, onOpened, onCredentialRefused, onCredentialSettled, onCredentialMissing, current],
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
      credential?: PreCollectedCredential | null,
    ): Promise<void> => {
      generation.current += 1;
      const mine = generation.current;

      setAttempt({
        sessionId,
        stage: { stage: 'connecting' },
        intent,
        decision: null,
        method: method ?? null,
        credential: credential ?? null,
      });
      onConnecting(sessionId);

      /* ADR-0033. Only the wizard's own test ever passes `'inline'`, and
         only it ever needs to hear this: a bastion mid-chain, needing a
         credential nobody saved, with nowhere else to ask for one now that
         the separate window is not going to open. Registered before the
         call it is listening across, so nothing emitted the instant the
         core starts can be missed. */
      let unlisten;
      if (intent === 'inline') {
        const registering = onInlineCredentialRequest((request) => {
          if (!current(mine)) return;
          void credentialPrompt(request).then((prompt) => {
            if (!current(mine)) return;
            setAttempt({
              sessionId,
              stage: { stage: 'awaitingBastionCredential', request, prompt },
              intent,
              decision: null,
              method: method ?? null,
              credential: credential ?? null,
            });
          });
        });

        /* Registering to hear this is a call into the webview's own event
           system, not into the core, and it can occasionally take far
           longer than the connect it exists to guard: found live (#240),
           an attempt sat on "Reaching…" long after the far host had already
           answered, because this single registration was still pending.
           This file's own opening promise needs a bound here too, even
           though nothing here produced a real `IpcError`. A late
           registration is not wasted: it is still unlistened once it
           lands, so it does not outlive the attempt that gave up on it. */
        const timedOut = Symbol('inline listener timed out');
        const outcome = await Promise.race([
          registering,
          new Promise<typeof timedOut>((resolve) => {
            setTimeout(() => resolve(timedOut), INLINE_LISTENER_TIMEOUT_MS);
          }),
        ]);

        if (outcome === timedOut) {
          void registering.then((fn) => fn());
          fail(
            sessionId,
            { code: 'bastionListenerTimedOut', hop: 'bastion' },
            mine,
            intent,
            method,
          );
          return;
        }

        unlisten = outcome;
      }

      let opened;
      try {
        opened = await connectSession(sessionId, continuing, intent === 'inline');
      } catch (rejection) {
        const error = asIpcError(rejection) ?? null;
        const held = error === null ? null : heldDecision(error);

        if (held === null) {
          const reported = reportedFailure(error);

          /* ADR-0039: a bastion mid-chain with nothing usable saved. This
             can only be `intent === 'open'`: the wizard's own test still
             collects the bastion's credential inline, on the same call, so
             the chain never fails this way while it is running. */
          if (current(mine) && reported.hop === 'bastion' && shouldPromptAfterSaved(reported.code)) {
            onCredentialMissing(sessionId, 'bastion');
            return;
          }

          fail(sessionId, reported, mine, intent, method);
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
            credential: credential ?? null,
          });
        } catch {
          fail(sessionId, { code: 'unknownDecision', hop: null }, mine, intent, method);
        }
        return;
      } finally {
        unlisten?.();
      }

      await authenticate(sessionId, opened, mine, intent, method, credential);
    },
    [authenticate, fail, onConnecting, onCredentialMissing, current],
  );

  const connect = useCallback(
    async (
      sessionId: string,
      intent: ConnectIntent = 'open',
      method?: SuggestedMethod,
      credential?: PreCollectedCredential | null,
    ): Promise<void> => {
      await attemptConnect(sessionId, intent, undefined, method, credential);
    },
    [attemptConnect],
  );

  const trust = useCallback(
    async (confirmation?: string): Promise<void> => {
      if (attempt === null || attempt.stage.stage !== 'deciding') return;
      const { sessionId, intent, method, credential } = attempt;
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
      await attemptConnect(sessionId, intent, pending, suggested, credential);
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

    /* ADR-0033. There is no window to answer for a bastion mid-chain either.
       The connection is held inside the still-running `connect_session`
       call, and dismissing its request is what lets that call unwind on its
       own, closing everything it opened exactly as a dismissed window
       already does today. */
    if (attempt !== null && attempt.stage.stage === 'awaitingBastionCredential') {
      void dismissCredential(attempt.stage.request).catch(() => undefined);
    }

    setAttempt(null);
    if (attempt !== null) {
      const settled = attempt.stage.stage === 'settled' || attempt.stage.stage === 'failed';
      onAbandoned(attempt.sessionId, settled);
    }
  }, [attempt, onAbandoned]);

  return { attempt, connect, trust, abandon };
}
