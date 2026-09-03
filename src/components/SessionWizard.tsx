import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { describeEditorFailure } from '../features/sessions';
import type { DraftField, DraftValues, EditorFailure, ForwardDraft } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { CredentialPrompt, Keep, Secret, Session, SuggestedMethod } from '../ipc';

import { FormSection } from './FormSection';
import { ForwardsFields } from './ForwardsFields';
import { HostGeneralFields } from './HostGeneralFields';
import { HostTopologyFields } from './HostTopologyFields';
import { InlineCredentialForm } from './InlineCredentialForm';
import { MethodPicker } from './MethodPicker';

interface SessionWizardProps {
  readonly title: string;
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  readonly discarding: boolean;
  readonly failure: EditorFailure | null;
  readonly onDismissFailure: () => void;
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  /** ADR-0054: the one field that is a list rather than a string, so it
   * replaces itself wholesale instead of going through `onChange`. */
  readonly onChangeForwards: (forwards: readonly ForwardDraft[]) => void;
  readonly jumpHosts: readonly Session[];
  readonly carried: readonly Session[];
  /** The saved session already reaching this exact host, port and user, if
   * there is one. */
  readonly duplicate: Session | null;
  /** Every group name already saved, for `HostGeneralFields`' own suggestion
   * list (#221). */
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
  /**
   * Validates and saves General/Topology, synchronously, so the caller knows
   * before starting a proof whether there is anything left to prove against.
   * `true` means the save went through (a field-level `wrong` already
   * re-rendered otherwise) and the wizard may go on to `onTest`/`onSkipTest`.
   *
   * ADR-0056: this is what `wizardNext`'s own check used to gate before the
   * Host-to-Access step transition existed to gate anything. One screen, one
   * action, so the check runs on that action instead of on a transition.
   */
  readonly onSave: () => boolean;
  /** Runs the proof-and-store phase: saves (the first time) or re-saves,
   * then connects, then renders `testSurface` while it runs. */
  readonly onTest: (method: SuggestedMethod) => void;
  /** Closes the wizard once an attempt has run at least once. */
  readonly onFinish: () => void;
  /**
   * What the settled row should say happened, or `null` before anything has.
   *
   * `CredentialSaved`/`ConnectionFailure` already state this once, inside
   * `testSurface`; this is what is left once either is dismissed and the
   * generic Back/Test again/Finish row is all that remains on screen. `App.tsx`
   * owns it because it is the one place both endings, and the ADR-0036 path
   * that skips testing altogether, are already visible.
   */
  readonly lastOutcome: 'saved' | 'failed' | null;
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
 * Registering or editing a host, as one screen: General, Topology and Access
 * all on it at once, since ADR-0056 retired the Host/Access two-step wizard
 * ADR-0030 gave this the first time. A new host and one already saved are
 * drawn by the same layout, pre-filled for the second.
 *
 * Saving hands off to the proof-and-store phase the instant there is nothing
 * left to decide, whether that is a host's first save or its fiftieth
 * reopen; the caller renders `<SessionWizard key={editorKey(target)} .../>`
 * so switching hosts remounts this component instead of leaking one host's
 * `proving`/`method` state into another's render.
 */
export function SessionWizard({
  title,
  values,
  wrong,
  discarding,
  failure,
  onDismissFailure,
  onChange,
  onChangeForwards,
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
  onSave,
  onTest,
  onFinish,
  lastOutcome,
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

  /* Whether Access has handed off to the proof phase. ADR-0056: reset by a
     remount (the caller keys this component per host) rather than by an
     effect watching a step that no longer exists. */
  const [proving, setProving] = useState(false);
  /* Whether an attempt has run at least once since `proving` last became
     true. Doubles as the effect's own fire-once guard and as the flag the
     render below uses to switch from "nothing to show yet, the attempt is
     starting" to "Back / Test again / Finish": one piece of state answers
     both questions because they are the same question asked twice. */
  const [attempted, setAttempted] = useState(false);

  /* Fires the one attempt Save started. Guarded by `attempted` rather than a
     dependency array: `onTest` and `method` are fresh on every render of
     `App.tsx`, so naming them here would refire this on every unrelated
     re-render while the attempt is in flight. Setting `attempted`
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

  /* Which of the proof phase's own sub-states is showing, purely for the
     label: the host key decision, the bastion's own field, the target's own
     field, and the settled row all count as "proving" alike. Not gated on
     `attempted`, which turns true the instant the attempt starts and stays
     true through all of them: it is `testSurface`/`bastionCredential`/
     `inlineCredential` all going back to `null` after a dismissal that hands
     the settled row its plain label back. */
  const phase: 'wizard.phase.bastion' | 'wizard.phase.signIn' | 'wizard.phase.proving' | null =
    !proving
      ? null
      : testSurface !== null
        ? 'wizard.phase.proving'
        : bastionCredential !== null
          ? 'wizard.phase.bastion'
          : inlineCredential !== null
            ? 'wizard.phase.signIn'
            : null;

  const startProving = (): void => {
    if (!onSave()) return;

    /* ADR-0036: nothing here could invalidate the stored credential, so
       this saves what changed and lands straight on the same row a settled
       attempt renders below, without ever starting one. */
    if (skipTest) {
      onSkipTest();
      setProving(true);
      setAttempted(true);
      return;
    }
    setProving(true);
  };

  return (
    <div className="flex h-full flex-col gap-5 p-7">
      <h2 className="text-ink text-[15px] font-semibold tracking-tight">{title}</h2>

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
        <div className="border-accent bg-accent-soft flex items-start justify-between gap-3 rounded border-l-2 px-3 py-2">
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

      {!proving && (
        <>
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
            <div className="flex flex-col gap-4 lg:w-[440px] lg:flex-none">
              <FormSection title={i18n.t('session.editor.section.general')}>
                <HostGeneralFields
                  values={values}
                  wrong={wrong}
                  onChange={onChange}
                  duplicate={duplicate}
                  groupNames={groupNames}
                  firstRef={first}
                />
              </FormSection>
              <FormSection title={i18n.t('session.editor.section.topology')}>
                <HostTopologyFields
                  values={values}
                  wrong={wrong}
                  onChange={onChange}
                  jumpHosts={jumpHosts}
                  carried={carried}
                />
              </FormSection>
            </div>

            <div className="flex flex-col gap-4 lg:w-[340px] lg:flex-none">
              <FormSection title={i18n.t('session.editor.section.access')}>
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
              </FormSection>
              <FormSection title={i18n.t('session.editor.section.forwarding')}>
                <ForwardsFields value={values.forwards} wrong={wrong} onChange={onChangeForwards} />
              </FormSection>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={startProving}
              className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold"
            >
              {i18n.t('session.editor.save')}
            </button>
          </div>
        </>
      )}

      {proving && phase !== null && (
        <span className="text-ink-faint text-[11px] font-semibold tracking-[0.06em] uppercase">
          {i18n.t(phase)}
        </span>
      )}

      {proving &&
        (testSurface !== null ? (
          <div className="relative min-h-[220px] max-w-[560px] flex-1">{testSurface}</div>
        ) : bastionCredential !== null ? (
          /* ADR-0033. Asked about before the target's own field: a session
             behind a jump host authenticates it first, and this is that
             order rendered rather than only enforced. No fixed `method`:
             Access answered a question about the target, and the bastion is
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
          /* The attempt has already settled once, refused or cancelled
             attempts included: the host is on disk either way, only
             `lastOutcome` says which ending this one actually reached.
             `CredentialSaved`/`ConnectionFailure` already said so, once,
             inside `testSurface`; dismissing either is what leaves this row
             on screen with nothing else saying it. */
          <div className="flex max-w-[440px] flex-col gap-2">
            {lastOutcome !== null && (
              <div
                className={`rounded border-l-2 px-3 py-2 text-[12.5px] ${
                  lastOutcome === 'saved'
                    ? 'border-ok/40 bg-ok-soft text-ok'
                    : 'border-danger bg-danger-soft text-danger-text'
                }`}
              >
                {i18n.t(lastOutcome === 'saved' ? 'wizard.result.saved' : 'wizard.result.failed')}
              </div>
            )}
            <div className="flex items-center gap-2">
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
