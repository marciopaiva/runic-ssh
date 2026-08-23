import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

import { SessionSurface, SurfaceAction } from './SessionSurface';

interface ConnectingSurfaceProps {
  readonly session: Session;
  /** Reaching the host, or waiting on the credential window. */
  readonly stage: 'connecting' | 'authenticating';
  readonly onCancel: () => void;
}

/**
 * What a session shows while it is being opened.
 *
 * This had no drawing and therefore no design: the panel was empty and the
 * status bar carried one word, for as long as the TCP stack took to give up —
 * roughly two minutes for a host that does not answer, and forever if the
 * transport connects and the SSH handshake stalls, because `client::Config`
 * sets no timeout at all.
 *
 * So it says which host, says what has and has not been sent, and offers a way
 * out. The cancel is the part that matters: without it the only way to stop a
 * stalled attempt is to close the application.
 *
 * The body is not decoration either. "The host key is checked before anything
 * is sent" is the ordering `features/sessions/connect.ts` exists to guarantee,
 * and saying it here is where the user can see it being kept.
 */
export function ConnectingSurface({
  session,
  stage,
  onCancel,
}: ConnectingSurfaceProps): JSX.Element {
  const i18n = useTranslator();
  const waiting = stage === 'authenticating';

  return (
    <SessionSurface
      titleId="connecting-title"
      title={
        waiting
          ? i18n.t('connecting.auth.title')
          : i18n.t('connecting.title', { host: session.host })
      }
      icon={
        <svg viewBox="0 0 16 16" className="h-[19px] w-[19px]" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path
            d="M8 2.2a5.8 5.8 0 015.53 4.02"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      }
      body={waiting ? i18n.t('connecting.auth.body') : i18n.t('connecting.body')}
      note={
        <span className="font-mono">
          {i18n.t('connecting.host', {
            user: session.user,
            host: session.host,
            port: session.port,
          })}
        </span>
      }
      actions={
        <SurfaceAction onClick={onCancel} variant="secondary">
          {i18n.t('connecting.cancel')}
        </SurfaceAction>
      }
    />
  );
}
