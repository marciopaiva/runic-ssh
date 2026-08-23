import type { JSX } from 'react';

import { describeFailure } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { IpcErrorCode, Session } from '../ipc';

import { SessionSurface, SurfaceAction } from './SessionSurface';

interface ConnectionFailureProps {
  readonly session: Session;
  readonly code: IpcErrorCode;
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
      body={i18n.t(failure.body)}
      note={
        <span className="font-mono">
          {i18n.t('failure.host', {
            user: session.user,
            host: session.host,
            port: session.port,
          })}
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
