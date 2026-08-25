import type { JSX } from 'react';

import { describeFailure } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Hop, IpcErrorCode, Session } from '../ipc';

import { SessionSurface, SurfaceAction } from './SessionSurface';

interface ConnectionFailureProps {
  readonly session: Session;
  readonly code: IpcErrorCode;
  /**
   * Which host in a chain the failure happened at, or `null` when the session
   * is not behind one.
   */
  readonly hop: Hop | null;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

/**
 * Why a connection did not happen.
 *
 * In the session's own panel rather than as a toast, because the user just
 * clicked that session and is looking at exactly this space, and because a
 * message that disappears on its own is one that disappears before it is read.
 *
 * Scoped to the session that failed rather than drawn over the whole main area,
 * which is what ADR-0014 left open and ADR-0015 closes: with one panel per
 * session, a failure in one connection has no way to cover another.
 *
 * The address that was tried is shown. Half the failures here are a port or a
 * user name that is not what somebody thought it was, and reading it back is
 * what makes that obvious without opening the editor.
 */
export function ConnectionFailure({
  session,
  code,
  hop,
  onRetry,
  onDismiss,
}: ConnectionFailureProps): JSX.Element {
  const i18n = useTranslator();
  const failure = describeFailure(code);

  return (
    <SessionSurface
      titleId="connection-failure-title"
      title={i18n.t(failure.title)}
      alert
      /* One icon for twelve failures, on purpose: the message names the cause,
         and a different glyph per code would be twelve things to learn for no
         information the sentence does not already carry. Cool rather than red —
         a host being down is not a security event, and `state.ts` draws the
         marker the same way for the same reason. */
      icon={
        <svg viewBox="0 0 16 16" className="h-[19px] w-[19px]" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.4 5.4l5.2 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
      body={i18n.t(failure.body)}
      note={
        <span className="flex flex-col gap-1">
          <span className="font-mono">
            {i18n.t('failure.host', {
              user: session.user,
              host: session.host,
              port: session.port,
            })}
          </span>
          {/* Which hop failed, when there was more than one. "Could not reach
              the host" is true of both hosts in a chain and says nothing about
              which, and the two call for opposite reactions: one is the jump
              host being down, the other is everything past it. */}
          {hop !== null && (
            <span>{i18n.t(hop === 'bastion' ? 'failure.hop.bastion' : 'failure.hop.target')}</span>
          )}
        </span>
      }
      actions={
        <>
          <SurfaceAction onClick={onDismiss} variant="secondary">
            {i18n.t('failure.dismiss')}
          </SurfaceAction>
          {failure.retryable && (
            <SurfaceAction onClick={onRetry} variant="primary">
              {i18n.t('failure.retry')}
            </SurfaceAction>
          )}
        </>
      }
    >
      {/* Only where there is nothing better to say. Everywhere else the
          message names the cause, and a code beside it is noise. */}
      {failure.title === 'failure.unexpected.title' && (
        <p className="text-ink-disabled font-mono text-[11px]">{code}</p>
      )}
    </SessionSurface>
  );
}
