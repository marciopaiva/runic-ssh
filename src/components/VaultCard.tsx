import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useTranslator } from '../features/settings';
import {
  asIpcError,
  disableInternalVault,
  enableInternalVault,
  internalVaultStatus,
  resetInternalVault,
  unlockInternalVault,
} from '../ipc';
import type { InternalVaultState } from '../ipc';

/**
 * The Settings card for ADR-0035's internal vault: turn it on, unlock it,
 * switch back to the system keychain, or reset it outright.
 *
 * Self-contained, the same way `InlineCredentialForm` owns its own
 * `credentialStoreStatus` probe rather than being handed the answer: nothing
 * else in the tree reads this state, so there is nothing a feature slice
 * would be sharing it with. The master password fields are uncontrolled and
 * read only at submit, the same rule every other credential field in this
 * tree already follows.
 *
 * Unlocking here, proactively, is the only way a locked vault ever opens.
 * A connection that hits `vaultLocked` mid-flow falls back to asking for the
 * credential fresh (`shouldPromptAfterSaved`, ADR-0035) rather than pausing
 * to prompt for the master password itself: doing that would mean holding
 * the credential just typed in React state across the prompt, which is
 * exactly what CLAUDE.md's section 6 forbids.
 */
export function VaultCard(): JSX.Element {
  const i18n = useTranslator();
  const [status, setStatus] = useState<InternalVaultState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enableForm = useRef<HTMLFormElement>(null);
  const unlockForm = useRef<HTMLFormElement>(null);

  const refresh = (): void => {
    void internalVaultStatus().then(setStatus);
  };

  useEffect(refresh, []);

  const reportFailure = (rejection: unknown): void => {
    const code = asIpcError(rejection)?.code;
    setError(i18n.t(code === 'vaultWrongPassword' ? 'vault.error.wrongPassword' : 'vault.error.generic'));
  };

  const enable = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') ?? '');
    const confirm = String(fields.get('confirm') ?? '');

    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setError(null);

    setBusy(true);
    void enableInternalVault(password)
      .then(() => {
        enableForm.current?.reset();
        refresh();
      })
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  const unlock = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') ?? '');

    setError(null);
    setBusy(true);
    void unlockInternalVault(password)
      .then(() => {
        unlockForm.current?.reset();
        refresh();
      })
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  const disable = (): void => {
    setError(null);
    setBusy(true);
    void disableInternalVault()
      .then(refresh)
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  const reset = (): void => {
    setError(null);
    setBusy(true);
    void resetInternalVault()
      .then(() => {
        setConfirmingReset(false);
        refresh();
      })
      .catch(reportFailure)
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-faint text-[11.5px] leading-snug">{i18n.t('vault.description')}</p>

      {error !== null && <p className="text-danger-text text-[11px]">{error}</p>}

      {status === undefined ? null : status === 'notConfigured' ? (
        <form ref={enableForm} onSubmit={enable} className="flex flex-col gap-2">
          <p className="text-ink-faint text-[11px] leading-snug">{i18n.t('vault.enable.hint')}</p>
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11px]">{i18n.t('vault.password')}</span>
            <input
              name="password"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11px]">{i18n.t('vault.password.confirm')}</span>
            <input
              name="confirm"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>
          {mismatch && (
            <span className="text-danger-text text-[11px]">
              {i18n.t('vault.password.mismatch')}
            </span>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bg-accent text-surface-base self-start rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {i18n.t('vault.enable')}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-ink-secondary flex items-center gap-1.5 text-[12px]">
            <VaultLockIcon locked={status === 'locked'} />
            {i18n.t(status === 'locked' ? 'vault.status.locked' : 'vault.status.unlocked')}
          </span>

          {/* Locked shows only the one way forward: unlock. A disable form
              beside it would put two master password fields on screen at
              once for what reads as the same question asked twice, and
              `disable` already re-asks for the password itself once there
              is something to disable. */}
          {status === 'locked' ? (
            <form ref={unlockForm} onSubmit={unlock} className="flex flex-col gap-2">
              <p className="text-ink-faint text-[11px] leading-snug">
                {i18n.t('vault.unlock.body')}
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-ink-muted text-[11px]">{i18n.t('vault.password')}</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className={INPUT}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="bg-accent text-surface-base self-start rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              >
                {i18n.t('vault.unlock')}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-ink-faint text-[11px] leading-snug">
                {i18n.t('vault.disable.hint')}
              </p>
              <button
                type="button"
                onClick={disable}
                disabled={busy}
                className="text-ink-secondary border-line-subtle hover:text-ink self-start rounded border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
              >
                {i18n.t('vault.disable')}
              </button>
            </div>
          )}

          {confirmingReset ? (
            <div className="border-danger bg-danger-soft flex flex-col gap-2 rounded border px-3 py-2">
              <p className="text-danger-text text-[11.5px] leading-relaxed">
                {i18n.t('vault.reset.hint')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="text-ink-secondary hover:bg-surface-raised rounded px-2.5 py-1 text-[12px]"
                >
                  {i18n.t('settings.discard.cancel')}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="text-danger-text border-danger rounded border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
                >
                  {i18n.t('vault.reset')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="text-danger-text hover:bg-danger-soft self-start rounded px-2 py-1 text-[11.5px]"
            >
              {i18n.t('vault.reset')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const INPUT =
  'bg-surface-input text-ink rounded border border-line-subtle px-2.5 py-1.5 font-mono text-[12.5px] outline-none';

/* Same hand-drawn style `MethodIcon` in `MethodPicker.tsx` already uses for
   its password glyph, a closed padlock: 16x16, a 1.3-weight stroke. Open is
   that same shackle lifted off one side rather than a different glyph
   entirely, so the two read as one lock in two states, not two icons. */
function VaultLockIcon({ locked }: { readonly locked: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
      {locked ? (
        <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
      ) : (
        /* Swung open rather than merely detached: the same left post, but
           the shackle arcs higher and further, ending well clear of the
           body instead of resting just above it, so the two states read as
           different shapes and not a rendering glitch of one. */
        <path d="M5.5 7V4.3a2.5 2.5 0 0 1 5-1.3" />
      )}
      <circle cx="8" cy="9.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
