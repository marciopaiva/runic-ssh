import type { JSX } from 'react';

import { describeEditorFailure } from '../features/sessions';
import type { DraftField, DraftValues, EditorFailure } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

import { SessionForm } from './SessionForm';

interface SessionEditorPanelProps {
  /** The host's name, or the word for one that does not exist yet. */
  readonly title: string;
  readonly isNew: boolean;
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  /** Whether something is waiting on an answer about unsaved work. */
  readonly discarding: boolean;
  /**
   * The last action on this form that the core refused, or `null`.
   *
   * Only ever a sentence about what did not happen. The fields below go on
   * showing what is stored, which stays true through a refusal: a keychain
   * that would not drop a credential still holds it. See #198.
   */
  readonly failure: EditorFailure | null;
  readonly onDismissFailure: () => void;
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  /** The saved hosts this one may be reached through. */
  readonly jumpHosts: readonly Session[];
  /** The saved hosts reached through this one. */
  readonly carried: readonly Session[];
  /** Whether the keychain holds a password for this host. */
  readonly storedCredential: boolean;
  /** Drops it, or `null` on a host that does not exist yet. */
  readonly onForget: (() => void) | null;
  /** Saves the form and collects a password by connecting once. */
  readonly onSavePassword: () => void;
  readonly onSubmit: () => void;
  readonly onDelete: () => void;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
}

/**
 * A saved host, on its own tab.
 *
 * It used to live inside Settings, and that was a category error rather than a
 * layout one. A host is not a preference: creating one is a task, and the tab
 * said "Settings" while somebody was doing it. Worse, the panel carried its own
 * list of hosts beside the sidebar's — the same list, twice on screen, which is
 * what made the whole arrangement feel wrong before anyone could name it.
 *
 * So there is no navigation column and no list here. The sidebar is the list.
 * This is one form, and the tab it is on carries the name of what is in it.
 *
 * ADR-0015 sorted surfaces into "belongs to a session" and "belongs to the
 * application". A stored host is neither, which is how it ended up in the only
 * box that was left.
 */
export function SessionEditorPanel({
  title,
  isNew,
  values,
  wrong,
  discarding,
  failure,
  onChange,
  jumpHosts,
  carried,
  storedCredential,
  onForget,
  onSavePassword,
  onSubmit,
  onDelete,
  onConfirmDiscard,
  onCancelDiscard,
  onDismissFailure,
}: SessionEditorPanelProps): JSX.Element {
  const i18n = useTranslator();
  const problem = failure === null ? null : describeEditorFailure(failure);

  return (
    <div className="flex h-full flex-col gap-5 p-7">
      {/* The title and nothing under it. The old subtitle said "Saved hosts",
          which described the list that used to sit beside this form and is now
          the sidebar — and the form already says the thing about secrets, at
          the bottom, where the fields are. */}
      <h2 className="text-ink text-[15px] font-semibold tracking-tight">{title}</h2>

      {discarding && (
        /* Above the form rather than over it: the thing at risk is right
           below, and a dialog would cover what somebody is being asked to
           decide about. */
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
        /* Above the form, in the slot the discard question already uses, and
           for the same reason: what it is about is the fields below, and a
           dialog would cover them. Not a surface in place of the form, which
           was the other candidate and would throw away a draft somebody is
           still holding to show them why a save failed. */
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
          {/* At the trailing edge, where the discard question above puts its
              answers. Two lines of message cannot share one row with a button,
              so it takes a row of its own rather than wrapping into one. */}
          <button
            type="button"
            onClick={onDismissFailure}
            className="border-line-strong text-ink-secondary hover:text-ink self-end rounded border bg-transparent px-2.5 py-1 text-[12px]"
          >
            {i18n.t('editor.failed.dismiss')}
          </button>
        </div>
      )}

      <SessionForm
        values={values}
        wrong={wrong}
        onChange={onChange}
        jumpHosts={jumpHosts}
        carried={carried}
        storedCredential={storedCredential}
        onForget={onForget}
        onSavePassword={onSavePassword}
        onSubmit={onSubmit}
        /* No delete on a host that was never saved: there is nothing to
           delete, and the button would be asking about the form itself. */
        onDelete={isNew ? null : onDelete}
      />
    </div>
  );
}
