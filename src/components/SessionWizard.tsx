import { useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { describeEditorFailure, describeFailure } from '../features/sessions';
import type { DraftField, DraftValues, EditorFailure, FailureCode, ForwardDraft } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { credentialStoreStatus, internalVaultStatus } from '../ipc';
import type { CredentialPrompt, Hop, Keep, Secret, Session, SuggestedMethod } from '../ipc';

import { CredentialAccessFields } from './CredentialAccessFields';
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
  /** Asks about deleting this host outright, or `null` on one that does not
   * exist yet: there is nothing on disk to delete. Answered by
   * `onConfirmDelete`/`onCancelDelete` below, not acted on directly: this
   * is a one-way door with nothing on the other side of it to undo from. */
  readonly onDelete: (() => void) | null;
  /** Whether the delete question above is on screen. */
  readonly deleting: boolean;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
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
  /**
   * Runs the proof-and-store phase: saves (the first time) or re-saves,
   * then connects. ADR-0058: the form stays on screen while this runs, so
   * there is nothing here to render for it beyond `testSurface`/
   * `testFailure` below.
   *
   * `credential` is whatever `startProving` read off the Access section's
   * own fields, ADR-0057, or `null` when there was nothing to read (a
   * stored or kept credential already covers this host). Travels as a
   * plain argument, never `useState`.
   */
  readonly onTest: (
    method: SuggestedMethod,
    credential: { readonly secret: Secret; readonly keep: Keep } | null,
  ) => void;
  /**
   * Closes the wizard the instant a test succeeds, with nothing on screen
   * to dismiss first: a save that worked has nothing left to ask about.
   * Reported strange live ("não precisamos dessa tela ao salvar... e
   * fechando a tela se tudo estiver ok"): the wizard used to wait on a
   * card being dismissed and then on Finish being clicked, two screens
   * for an ending that needed neither. `abandon` and `finishWizard`
   * together, called once by the effect that watches `lastOutcome`.
   */
  readonly onAutoFinish: () => void;
  /**
   * Whether the last attempt this session made saved, or `null` before one
   * has. Drives `onAutoFinish` above; a failure is read from `testFailure`,
   * not from this, since this alone cannot say what to tell the user.
   */
  readonly lastOutcome: 'saved' | 'failed' | null;
  /**
   * The host key decision and the connecting spinner, exactly as Sessions
   * renders them, or `null` when nothing is attempting a connection for
   * this host right now. Owned by `App.tsx`, which already reads the shared
   * `ConnectStage` machine ADR-0030 built. Shown inline, above the form
   * rather than in place of it: this is still the same page, only waiting
   * on the host key or the network, not a different screen. `'failed'`
   * never reaches here, `testFailure` below is that ending instead.
   */
  readonly testSurface: ReactNode | null;
  /**
   * Why the target's own credential test failed, or `null` before one has
   * or once it has not. Reported live: a wrong password used to open a
   * whole different card ("O host recusou a credencial") rather than
   * behaving like an ordinary form whose password field is wrong. Data
   * instead of a `ReactNode` so this component can put it next to the
   * field it is actually about and let Save, not a separate button, be
   * the retry.
   */
  readonly testFailure: { readonly code: FailureCode; readonly hop: Hop | null } | null;
  /**
   * A bastion's own field, ADR-0033, or `null` when nothing is waiting on
   * one. The target's own credential is no longer a separate field here at
   * all, ADR-0057: it is read out of the Access section's own fields,
   * below, at the moment Save is clicked. Shown inline for the same reason
   * `testSurface` is.
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
 * Saving starts the proof the instant there is nothing left to decide,
 * whether that is a host's first save or its fiftieth reopen, ADR-0058: the
 * form itself never leaves the screen for it, the way an ordinary form's
 * fields do not disappear while it submits. A host key decision or a
 * bastion's own field shows inline, above the form; a failed credential
 * shows inline, next to the field it is about, and Save is the retry. Only
 * success ends this component's own part in it, closing the wizard outright
 * (`onAutoFinish`). The caller renders `<SessionWizard key={editorKey(target)}
 * .../>` so switching hosts remounts this component instead of leaking one
 * host's `proving`/`method` state into another's render.
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
  deleting,
  onConfirmDelete,
  onCancelDelete,
  onSave,
  onTest,
  onAutoFinish,
  lastOutcome,
  testSurface,
  testFailure,
  bastionCredential,
  onConfirmDiscard,
  onCancelDiscard,
  onCancel,
}: SessionWizardProps): JSX.Element {
  const i18n = useTranslator();
  const first = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<SuggestedMethod>('password');
  const problem = failure === null ? null : describeEditorFailure(failure);

  /* Probed once the Access section has a field to show for it: whether the
     target's own credential, once typed, has anywhere to be kept. ADR-0057
     moved this probe up from `InlineCredentialForm`'s own effect, since
     `startProving` below needs the answer synchronously, at the moment Save
     is clicked, and the field that used to own this probe no longer exists
     for the target's own case. */
  const [canRemember, setCanRemember] = useState<boolean | undefined>(undefined);
  /* ADR-0035: which store `canRemember` actually means. Read independently
     for the same reason `InlineCredentialForm` always has. */
  const [usesVault, setUsesVault] = useState(false);
  const needsCredential = !storedCredential && !keptCredential;

  useEffect(() => {
    if (!needsCredential) return;
    void credentialStoreStatus()
      .then((status) => setCanRemember(status.kind === 'available'))
      .catch(() => setCanRemember(false));
    void internalVaultStatus()
      .then((status) => setUsesVault(status !== 'notConfigured'))
      .catch(() => setUsesVault(false));
  }, [needsCredential]);

  /* Where the Access section's own fields live, read once at the moment
     Save is clicked, `startProving` below. Never `useState`: the same
     discipline `InlineCredentialForm.tsx` already keeps for the bastion's
     own field. */
  const credentialForm = useRef<HTMLFormElement>(null);
  /* What `startProving` read, waiting for the effect a tick below to hand
     it to `onTest`. A ref rather than state for the same reason the form
     itself is uncontrolled: this is never part of a render. Cleared the
     instant it is read back out. */
  const pendingCredential = useRef<{ readonly secret: Secret; readonly keep: Keep } | null>(null);

  /* Whether Save has been clicked at least once since this component
     mounted. Exists only to keep the firing effect below from running on
     mount, before anyone has clicked anything: `attempted` alone would
     start `false` there too. Reset by a remount (the caller keys this
     component per host) rather than by an effect watching a step that no
     longer exists, ADR-0056. */
  const [proving, setProving] = useState(false);
  /* Whether the current `proving` attempt has actually been started yet.
     The firing effect's own fire-once guard: `startProving` sets this back
     to `false` on a retry, so a second Save click fires a second attempt
     instead of the effect seeing an attempt already running and doing
     nothing. */
  const [attempted, setAttempted] = useState(false);

  /* Fires the one attempt Save started. Guarded by `attempted` rather than a
     dependency array: `onTest` and `method` are fresh on every render of
     `App.tsx`, so naming them here would refire this on every unrelated
     re-render while the attempt is in flight. Setting `attempted`
     synchronously, in the same tick as the call, is what a dependency array
     cannot do and a ref alone cannot drive the render off.

     What `startProving` read off the Access section is in
     `pendingCredential`, not in a dependency here, for the same reason. */
  useEffect(() => {
    if (proving && !attempted && failure === null && testSurface === null && bastionCredential === null) {
      setAttempted(true);
      const credential = pendingCredential.current;
      pendingCredential.current = null;
      onTest(method, credential);
    }
  });

  /* Closes the wizard the instant Save's own attempt succeeds, with nothing
   * shown to dismiss first. Guarded by a ref rather than by unmounting on
   * its own: `onAutoFinish` closes this component from the outside
   * (`App.tsx` drops it from `editors`), which does not happen within the
   * same tick, so a plain condition here would fire again on the next
   * render before that takes effect. */
  const autoFinished = useRef(false);
  useEffect(() => {
    if (proving && lastOutcome === 'saved' && !autoFinished.current) {
      autoFinished.current = true;
      onAutoFinish();
    }
  });

  const dismissFailure = (): void => {
    setAttempted(false);
    onDismissFailure();
  };

  /* Whether to hold Save (and Cancel/Delete, so nobody backs out of the
     editor while it is mid-flight): a host key decision, a bastion's own
     field, or the connecting spinner are all a live attempt, freshly read
     off `attempt` each render, so there is no staleness to guard against
     the way there would be reading `lastOutcome`/`testFailure` back from
     the same round trip. The gap this misses is the moment between
     clicking Save and `submitIn`'s own save resolving, before
     `attemptConnect` has set anything yet; a second click landing in it is
     superseded cleanly by `useConnect`'s own generation counter, the same
     protection a slow double click anywhere else in this app already
     relies on. */
  const busy = testSurface !== null || bastionCredential !== null;

  /**
   * Reads the Access section's own credential fields, ADR-0057, the same way
   * `InlineCredentialForm`'s own `submit` handler already does: `FormData`
   * off the form at the moment of the read, `Secret` built from it, never
   * `useState`. `null` when there is nothing to read, a stored or kept
   * credential already covering this host, matching `needsCredential`
   * above, which is the same condition the fields themselves render behind.
   */
  const readCredential = (): { readonly secret: Secret; readonly keep: Keep } | null => {
    if (!needsCredential) return null;
    const form = credentialForm.current;
    if (form === null) return null;

    const keep: Keep = canRemember === true ? 'stored' : 'forThisRun';
    const fields = new FormData(form);
    const passphrase = String(fields.get('passphrase') ?? '');
    const secret: Secret =
      method === 'password'
        ? { password: String(fields.get('password') ?? '') }
        : passphrase === ''
          ? { privateKey: String(fields.get('privateKey') ?? '') }
          : { privateKey: String(fields.get('privateKey') ?? ''), passphrase };

    return { secret, keep };
  };

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

    /* Read at the moment of the click, ADR-0057, same as always: the Access
       section stays mounted through a retry now, but the field is still
       uncontrolled and this is still the one moment its value is read. */
    pendingCredential.current = readCredential();
    /* Re-arms the firing effect for a retry. `proving` alone would not: it
       is already `true` from the failed attempt, and only `attempted`
       going back to `false` tells that effect there is a new one to
       start. */
    setAttempted(false);
    setProving(true);
  };

  return (
    <div className="flex h-full flex-col gap-5 p-7">
      <h2 className="text-ink text-[15px] font-semibold tracking-tight">{title}</h2>

      {discarding && (
        <div
          role="alertdialog"
          aria-label={i18n.t('settings.discard.title')}
          className="border-danger bg-danger-soft flex flex-wrap items-center gap-3 rounded border px-3 py-2"
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

      {deleting && (
        <div
          role="alertdialog"
          aria-label={i18n.t('session.editor.delete.confirm.title', { name: title })}
          className="border-danger bg-danger-soft flex flex-wrap items-center gap-3 rounded border px-3 py-2"
        >
          <p className="text-danger-text mr-auto text-[12px]">
            {i18n.t('session.editor.delete.confirm.title', { name: title })}
          </p>
          <button
            type="button"
            onClick={onCancelDelete}
            className="border-line-strong text-ink-secondary hover:text-ink rounded border bg-transparent px-2.5 py-1 text-[12px]"
          >
            {i18n.t('session.editor.delete.confirm.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="text-danger-text border-danger rounded border px-2.5 py-1 text-[12px] font-semibold"
          >
            {i18n.t('session.editor.delete.confirm.confirm')}
          </button>
        </div>
      )}

      {problem !== null && (
        <div
          role="alert"
          className="border-danger bg-danger-soft flex flex-col gap-2 rounded border px-3 py-2"
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

      {/* A host key decision or a bastion's own field, inline above the form
          rather than in place of it: reported live ("tinhamos combinado de
          nao usar o componente wizard, era para o processo de form comum"),
          this is still the same page a wrong password stays on below, only
          waiting on one of these two genuine decisions first. `testSurface`
          never carries the ending any more, ADR-0058: `'settled'` and
          `'failed'` are both handled without it, above in `App.tsx` and
          below via `testFailure`. */}
      {testSurface !== null && (
        <div className="relative min-h-[220px] max-w-[560px]">{testSurface}</div>
      )}
      {bastionCredential !== null && (
        /* ADR-0033. Asked about before the target's own field: a session
           behind a jump host authenticates it first, and this is that order
           rendered rather than only enforced. No fixed `method`: Access
           answered a question about the target, and the bastion is a host
           nothing has asked about yet. */
        <InlineCredentialForm
          carrying={bastionCredential.prompt.carrying}
          onSubmit={bastionCredential.onSubmit}
          onCancel={bastionCredential.onCancel}
        />
      )}

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
              {onForget !== null && (storedCredential || keptCredential) && (
                <button
                  type="button"
                  onClick={onForget}
                  className="text-danger-text hover:bg-danger-soft rounded px-2 py-1 text-[11.5px]"
                >
                  {i18n.t('session.editor.credential.forget')}
                </button>
              )}
            </div>

            {/* ADR-0057: the field itself, in place, rather than a notice
                that one is coming after Save. Stays mounted through a
                failed attempt, ADR-0058: this is the field Save just
                proved wrong, and retyping it is the retry. */}
            {needsCredential && (
              <CredentialAccessFields
                method={method}
                formRef={credentialForm}
                canRemember={canRemember}
                usesVault={usesVault}
                disabled={busy}
                invalid={testFailure !== null}
              />
            )}

            {/* ADR-0058: a wrong password reported live as a form that
                "não valida e continua na mesma página, mostrando que o
                campo de senha está errado" rather than as a card of its
                own. Reached with no field above it, too: a stored
                credential the host now refuses (its own password changed
                on the far end) has nothing to attach to but this section,
                which is still the right place for a credential's own
                failure to be said. */}
            {testFailure !== null && (
              <div className="border-danger bg-danger-soft text-danger-text rounded border-l-2 px-3 py-2 text-[12.5px] leading-relaxed">
                <p className="font-semibold">
                  {i18n.t(describeFailure(testFailure.code, testFailure.hop).title)}
                </p>
                <p>{i18n.t(describeFailure(testFailure.code, testFailure.hop).body)}</p>
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
            disabled={busy}
            className="text-danger-text hover:bg-danger-soft mr-auto rounded px-2 py-1.5 text-[12px] disabled:opacity-40"
          >
            {i18n.t('session.editor.delete')}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`text-ink-secondary hover:bg-surface-raised rounded px-2.5 py-1.5 text-[12px] disabled:opacity-40 ${
            onDelete === null ? 'mr-auto' : ''
          }`}
        >
          {i18n.t('session.editor.cancel')}
        </button>
        <button
          type="button"
          onClick={startProving}
          disabled={busy || (needsCredential && canRemember === undefined)}
          className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          {i18n.t(busy && testSurface !== null ? 'wizard.phase.proving' : 'session.editor.save')}
        </button>
      </div>
    </div>
  );
}
