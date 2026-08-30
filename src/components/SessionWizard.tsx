import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { describeEditorFailure } from '../features/sessions';
import type { DraftField, DraftValues, EditorFailure } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { CredentialPrompt, Keep, Secret, Session, SuggestedMethod } from '../ipc';

import { HostFields } from './HostFields';
import { InlineCredentialForm } from './InlineCredentialForm';
import { MethodPicker } from './MethodPicker';

interface SessionWizardProps {
  readonly title: string;
  readonly step: 1 | 2;
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  readonly discarding: boolean;
  readonly failure: EditorFailure | null;
  readonly onDismissFailure: () => void;
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  readonly jumpHosts: readonly Session[];
  readonly carried: readonly Session[];
  /** The saved session already reaching this exact host, port and user, if
   * there is one. */
  readonly duplicate: Session | null;
  /** Every group name already saved, for `HostFields`' own suggestion list
   * (#221). */
  readonly groupNames: readonly string[];
  /**
   * Whether this editor opened because Sessions sent someone here, rather
   * than because they opened it themselves. ADR-0039: the only thing left
   * that explains a screen changing out from under a click elsewhere, now
   * that a missing credential no longer opens a window of its own.
   */
  readonly missingCredential: boolean;
  readonly onDismissMissingCredential: () => void;
  /** Whether the keychain already holds a credential for this host. ADR-0034:
   * the only surface left that can say so, now that `SessionForm` is gone. */
  readonly storedCredential: boolean;
  /** Whether a credential is kept for this host for the life of the run.
   * ADR-0038: the other half `storedCredential` never named. */
  readonly keptCredential: boolean;
  /**
   * Whether Access has nothing left to prove. ADR-0036: true only for an
   * existing host, already carrying a stored credential, whose host, port
   * and user still match what is saved. A new host, a changed one, or one
   * with nothing stored yet always keeps testing.
   */
  readonly skipTest: boolean;
  /** Saves whatever changed (name, group, kind) without connecting. Only
   * ever called when `skipTest` is true. */
  readonly onSkipTest: () => void;
  /** Drops the stored credential, or `null` on a host that does not exist
   * yet: there is nothing to drop. */
  readonly onForget: (() => void) | null;
  /** Deletes this host outright, or `null` on one that does not exist yet:
   * there is nothing on disk to delete. */
  readonly onDelete: (() => void) | null;
  readonly onBack: () => void;
  readonly onNext: () => void;
  /** Runs the proof-and-store phase: saves (the first time) or re-saves,
   * then connects, then renders `testSurface` while it runs. */
  readonly onTest: (method: SuggestedMethod) => void;
  /** Closes the wizard once an attempt has run at least once. */
  readonly onFinish: () => void;
  /**
   * The host key and credential screens, exactly as Sessions renders them,
   * or `null` when nothing is attempting a connection for this host right
   * now. Owned by `App.tsx`, which already reads the shared `ConnectStage`
   * machine ADR-0030 built; this component only decides where to put it.
   */
  readonly testSurface: ReactNode | null;
  /**
   * The wizard's own field for the secret, ADR-0032, or `null` when the
   * attempt has not reached that point (or is not this host's).
   */
  readonly inlineCredential: {
    readonly onSubmit: (secret: Secret, keep: Keep) => void;
    readonly onCancel: () => void;
  } | null;
  /**
   * A bastion's own field, ADR-0033, or `null` when nothing is waiting on
   * one. Checked before `inlineCredential`: a session behind a jump host
   * asks for this one first, and the target's own field is never reached
   * until it is answered.
   */
  readonly bastionCredential: {
    readonly prompt: CredentialPrompt;
    readonly onSubmit: (secret: Secret, keep: Keep) => void;
    readonly onCancel: () => void;
  } | null;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
  readonly onCancel: () => void;
}

/**
 * Registering or editing a host, as the sequence it was asked for: the host,
 * then how you will get in, then proving it works. ADR-0030, consolidated by
 * ADR-0034 into the only way either happens: a new host and one already
 * saved are drawn by the same two steps, pre-filled for the second.
 *
 * Host and Access are the only real, navigable steps. What follows Access is
 * not a third step: it runs itself, the instant there is nothing left to
 * decide, whether that is a host's first save or its fiftieth reopen.
 */
export function SessionWizard({
  title,
  step,
  values,
  wrong,
  discarding,
  failure,
  onDismissFailure,
  onChange,
  jumpHosts,
  carried,
  duplicate,
  groupNames,
  missingCredential,
  onDismissMissingCredential,
  storedCredential,
  keptCredential,
  skipTest,
  onSkipTest,
  onForget,
  onDelete,
  onBack,
  onNext,
  onTest,
  onFinish,
  testSurface,
  inlineCredential,
  bastionCredential,
  onConfirmDiscard,
  onCancelDiscard,
  onCancel,
}: SessionWizardProps): JSX.Element {
  const i18n = useTranslator();
  const first = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<SuggestedMethod>('password');
  const problem = failure === null ? null : describeEditorFailure(failure);

  /* Whether Access has handed off to the proof phase. Not part of `step`:
     ADR-0034 is explicit that what follows Access is not a third step, only
     a phase Access itself leads into once there is nothing left to choose. */
  const [proving, setProving] = useState(false);
  /* Whether an attempt has run at least once since `proving` last became
     true. Doubles as the effect's own fire-once guard and as the flag the
     render below uses to switch from "nothing to show yet, the attempt is
     starting" to "Back / Test again / Finish": one piece of state answers
     both questions because they are the same question asked twice. */
  const [attempted, setAttempted] = useState(false);

  /* Leaving Access, Back to Host, or Access itself remounting for a
     different host, resets both. ADR-0034's own rule is "every reopen
     retests", and this is what makes a reopen actually count as one rather
     than finding `attempted` already true from the last time. */
  useEffect(() => {
    if (step !== 2) {
      setProving(false);
      setAttempted(false);
    }
  }, [step]);

  /* Fires the one attempt Access's "Next" started. Guarded by `attempted`
     rather than a dependency array: `onTest` and `method` are fresh on every
     render of `App.tsx`, so naming them here would refire this on every
     unrelated re-render while the attempt is in flight. Setting `attempted`
     synchronously, in the same tick as the call, is what a dependency array
     cannot do and a ref alone cannot drive the render off. See the field
     doc comment above for why one flag serves both. */
  useEffect(() => {
    if (
      proving &&
      !attempted &&
      failure === null &&
      testSurface === null &&
      bastionCredential === null &&
      inlineCredential === null
    ) {
      setAttempted(true);
      onTest(method);
    }
  });

  const dismissFailure = (): void => {
    setAttempted(false);
    onDismissFailure();
  };

  return (
    <div className="flex h-full flex-col gap-5 p-7">
      <h2 className="text-ink text-[15px] font-semibold tracking-tight">{title}</h2>

      <ol className="flex items-center gap-2 text-[11px]">
        {(
          [
            { key: 'host', label: 'wizard.step.host', current: step === 1, reached: step >= 1 },
            { key: 'auth', label: 'wizard.step.auth', current: step === 2, reached: step >= 2 },
          ] as const
        ).map((entry, index) => (
          <li key={entry.key} className="flex items-center gap-2">
            {index > 0 && <span className="text-ink-faint">→</span>}
            <span
              aria-current={entry.current ? 'step' : undefined}
              className={
                entry.current
                  ? 'text-ink font-semibold'
                  : entry.reached
                    ? 'text-ink-secondary'
                    : 'text-ink-faint'
              }
            >
              {i18n.t(entry.label)}
            </span>
          </li>
        ))}
      </ol>

      {discarding && (
        <div
          role="alertdialog"
          aria-label={i18n.t('settings.discard.title')}
          className="border-danger bg-danger-soft flex max-w-[440px] flex-wrap items-center gap-3 rounded border px-3 py-2"
        >
          <p className="text-danger-text mr-auto text-[12px]">{i18n.t('settings.discard.title')}</p>
          <button
            type="button"
            onClick={onCancelDiscard}
            className="border-line-strong text-ink-secondary hover:text-ink rounded border bg-transparent px-2.5 py-1 text-[12px]"
          >
            {i18n.t('settings.discard.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirmDiscard}
            className="text-danger-text border-danger rounded border px-2.5 py-1 text-[12px] font-semibold"
          >
            {i18n.t('settings.discard.confirm')}
          </button>
        </div>
      )}

      {problem !== null && (
        <div
          role="alert"
          className="border-danger bg-danger-soft flex max-w-[440px] flex-col gap-2 rounded border px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-danger-text text-[12px] font-semibold">{i18n.t(problem.title)}</p>
            <p className="text-ink-secondary mt-0.5 text-[11.5px] leading-relaxed">
              {i18n.t(problem.body)}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissFailure}
            className="border-line-strong text-ink-secondary hover:text-ink self-end rounded border bg-transparent px-2.5 py-1 text-[12px]"
          >
            {i18n.t('editor.failed.dismiss')}
          </button>
        </div>
      )}

      {missingCredential && (
        <div className="border-accent bg-accent-soft flex max-w-[440px] items-start justify-between gap-3 rounded border-l-2 px-3 py-2">
          <p className="text-ink text-[12.5px] leading-relaxed">
            {i18n.t('session.editor.missingCredential')}
          </p>
          <button
            type="button"
            onClick={onDismissMissingCredential}
            className="text-ink-secondary hover:text-ink shrink-0 text-[12px]"
          >
            {i18n.t('editor.failed.dismiss')}
          </button>
        </div>
      )}

      {step === 1 && (
        <>
          <HostFields
            values={values}
            wrong={wrong}
            onChange={onChange}
            jumpHosts={jumpHosts}
            carried={carried}
            groupNames={groupNames}
            duplicate={duplicate}
            firstRef={first}
          />
          <div className="flex max-w-[440px] items-center gap-2">
            {onDelete !== null && (
              <button
                type="button"
                onClick={onDelete}
                className="text-danger-text hover:bg-danger-soft mr-auto rounded px-2 py-1.5 text-[12px]"
              >
                {i18n.t('session.editor.delete')}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className={`text-ink-secondary hover:bg-surface-raised rounded px-2.5 py-1.5 text-[12px] ${
                onDelete === null ? 'mr-auto' : ''
              }`}
            >
              {i18n.t('session.editor.cancel')}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
            >
              {i18n.t('wizard.next')}
            </button>
          </div>
        </>
      )}

      {step === 2 && !proving && (
          <div className="flex max-w-[440px] flex-col gap-3">
            <MethodPicker value={method} onChange={setMethod} />

            {/* What the host already has, rather than a field for it: the
                same fact `SessionForm` used to state, moved here since this
                is the only screen left that asks about access at all.
                ADR-0038: the keychain and the run are two different stores,
                so both sentences render when both answer yes, reusing
                `kept.ts`'s own vocabulary for the run half rather than
                inventing a second way to say it. */}
            {(storedCredential || keptCredential) && (
              <div className="flex flex-col items-start gap-1">
                {storedCredential && (
                  <span className="text-ink-faint text-[11px] leading-snug">
                    {i18n.t('session.editor.credential.stored')}
                  </span>
                )}
                {keptCredential && (
                  <span className="text-ink-faint text-[11px] leading-snug">
                    {i18n.t('kept.run.body')}
                  </span>
                )}
                {onForget !== null && (
                  <button
                    type="button"
                    onClick={onForget}
                    className="text-danger-text hover:bg-danger-soft rounded px-2 py-1 text-[11.5px]"
                  >
                    {i18n.t('session.editor.credential.forget')}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-ink-secondary hover:bg-surface-raised mr-auto rounded px-2.5 py-1.5 text-[12px]"
              >
                {i18n.t('session.editor.cancel')}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="text-ink-secondary hover:bg-surface-raised rounded px-2.5 py-1.5 text-[12px]"
              >
                {i18n.t('wizard.back')}
              </button>
              <button
                type="button"
                onClick={() => {
                  /* ADR-0036: nothing here could invalidate the stored
                     credential, so this saves what changed and lands
                     straight on the same row a settled attempt renders
                     below, without ever starting one. */
                  if (skipTest) {
                    onSkipTest();
                    setProving(true);
                    setAttempted(true);
                    return;
                  }
                  setProving(true);
                }}
                className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
              >
                {i18n.t('wizard.next')}
              </button>
            </div>
          </div>
      )}

      {step === 2 &&
        proving &&
        (testSurface !== null ? (
          <div className="relative min-h-[220px] max-w-[560px] flex-1">{testSurface}</div>
        ) : bastionCredential !== null ? (
          /* ADR-0033. Asked about before the target's own field: a session
             behind a jump host authenticates it first, and this is that
             order rendered rather than only enforced. No fixed `method`:
             step 2 answered a question about the target, and the bastion is
             a host nothing has asked about yet. */
          <InlineCredentialForm
            method={null}
            carrying={bastionCredential.prompt.carrying}
            onSubmit={bastionCredential.onSubmit}
            onCancel={bastionCredential.onCancel}
          />
        ) : inlineCredential !== null ? (
          <InlineCredentialForm
            method={method}
            onSubmit={inlineCredential.onSubmit}
            onCancel={inlineCredential.onCancel}
          />
        ) : attempted ? (
          /* The attempt has already settled once. Successfully, refused, or
             cancelled, it does not matter which, the host is on disk either
             way. Just the row: retry, or leave. */
          <div className="flex max-w-[440px] items-center gap-2">
            <button
              type="button"
              onClick={() => setProving(false)}
              className="text-ink-secondary hover:bg-surface-raised mr-auto rounded px-2.5 py-1.5 text-[12px]"
            >
              {i18n.t('wizard.back')}
            </button>
            <button
              type="button"
              onClick={() => onTest(method)}
              className="text-ink-secondary border-line-subtle hover:text-ink rounded border px-2.5 py-1.5 text-[12px]"
            >
              {i18n.t('wizard.test.now')}
            </button>
            <button
              type="button"
              onClick={onFinish}
              className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
            >
              {i18n.t('wizard.finish')}
            </button>
          </div>
        ) : (
          /* Nothing to show yet: the effect above has already started the
             save that puts the host on disk and, from there, the attempt
             that proves it. This is only ever on screen for the width of
             that round trip. The status bar already reads "connecting"
             underneath it, so nothing here repeats that. */
          <div className="max-w-[440px]" />
        ))}
    </div>
  );
}
