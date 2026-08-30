import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { describeKeeping } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { internalVaultStatus } from '../ipc';
import type { Keeping, Session } from '../ipc';

import { SessionSurface, SurfaceAction } from './SessionSurface';

interface CredentialSavedProps {
  readonly session: Session;
  /** What the core answered when the host accepted the password. */
  readonly keeping: Keeping;
  /** Whether the session now carries a credential id. */
  readonly stored: boolean;
  readonly onDismiss: () => void;
}

/**
 * What became of a password collected by connecting once.
 *
 * In the panel the attempt was already using, which is what makes this cost
 * nothing: the same space said "connecting" a moment ago, and the session it
 * belongs to is the session being talked about. The connection is closed by the
 * time this renders. Nothing here can act on it, and the surface says so by
 * offering one way out and no retry.
 *
 * Four endings rather than a tick: three of them mean the host asks again next
 * time, and which one happened is the only thing worth reporting.
 */
export function CredentialSaved({
  session,
  keeping,
  stored,
  onDismiss,
}: CredentialSavedProps): JSX.Element {
  const i18n = useTranslator();
  /* ADR-0035: which store `stored` actually names. `describeKeeping` stays
     pure, so the probe lives here rather than in it. */
  const [usesVault, setUsesVault] = useState(false);

  useEffect(() => {
    void internalVaultStatus()
      .then((status) => setUsesVault(status !== 'notConfigured'))
      .catch(() => setUsesVault(false));
  }, []);

  const outcome = describeKeeping(keeping, stored, usesVault);

  return (
    <SessionSurface
      titleId="credential-saved-title"
      title={i18n.t(outcome.title)}
      tone={outcome.tone}
      body={i18n.t(outcome.body)}
      /* `connecting.host` rather than `failure.host`, which reads "Tried
         deploy@host". Nothing was tried here: it worked, and the address is
         shown for the same reason it is shown while connecting, which is that
         a user name or a port being wrong is what half of this is about. */
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
        <SurfaceAction onClick={onDismiss} variant="primary">
          {i18n.t('kept.done')}
        </SurfaceAction>
      }
    />
  );
}
