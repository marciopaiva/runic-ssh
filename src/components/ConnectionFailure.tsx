import type { JSX } from 'react';

import { describeFailure } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { IpcErrorCode, Session } from '../ipc';

interface ConnectionFailureProps {
  readonly session: Session;
  readonly code: IpcErrorCode;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

/**
 * Why a connection did not happen.
 *
 * In the main area rather than as a toast, because the user just clicked a
 * session and is looking at exactly this space, and because a message that
 * disappears on its own is one that disappears before it is read.
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
    <div className="bg-surface-terminal flex h-full items-center justify-center p-8">
      <div className="flex max-w-[440px] flex-col gap-2.5">
        <h2 className="text-ink text-[14px] font-semibold">{i18n.t(failure.title)}</h2>

        <p className="text-ink-secondary text-[12.5px] leading-relaxed text-pretty">
          {i18n.t(failure.body)}
        </p>

        <p className="text-ink-faint font-mono text-[11.5px]">
          {i18n.t('failure.host', {
            user: session.user,
            host: session.host,
            port: session.port,
          })}
        </p>

        {/* Only where there is nothing better to say. Everywhere else the
            message names the cause, and a code beside it is noise. */}
        {failure.title === 'failure.unexpected.title' && (
          <p className="text-ink-disabled font-mono text-[11px]">{code}</p>
        )}

        <div className="mt-2 flex gap-2">
          {failure.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
            >
              {i18n.t('failure.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="border-line-strong text-ink-secondary hover:text-ink rounded border px-3 py-1.5 text-[12px]"
          >
            {i18n.t('failure.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
