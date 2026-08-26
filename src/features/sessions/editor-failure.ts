/**
 * Saying that an action on the host form did not happen.
 *
 * `submitIn` had no `catch`, so a save the core refused was a rejected promise
 * nobody read and the form said nothing at all. Two pieces of work had already
 * been shaped around that rather than through it, which is what made it worth
 * closing before the third. See #198.
 *
 * The editor renders the *fact* rather than the outcome: after a failed
 * forget, the block goes on saying the host has a password, which is true,
 * because the entry is still there. What was missing is the sentence saying
 * the click failed, and that is all this adds. Nothing here changes what the
 * form claims about the host.
 */

import type { IpcErrorCode } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

/** The three things the form can ask the core to do. */
export type EditorAction = 'save' | 'delete' | 'forget';

export interface EditorFailure {
  readonly action: EditorAction;
  /** `null` when the rejection was not one of ours, which is a bug in here. */
  readonly code: IpcErrorCode | null;
}

export interface EditorProblem {
  /** What did not happen. Named by the action, because that is what was asked. */
  readonly title: ParameterlessKey;
  /** Why, in terms somebody can act on, or plainly that it is ours. */
  readonly body: ParameterlessKey;
}

const TITLES: Readonly<Record<EditorAction, ParameterlessKey>> = {
  save: 'editor.failed.save',
  delete: 'editor.failed.delete',
  forget: 'editor.failed.forget',
};

/**
 * Which sentence a code earns.
 *
 * Three groups rather than one message per code, and the grouping is by what
 * the reader can do about it. A settings file that cannot be written and a
 * configuration directory that cannot be resolved are one problem to somebody
 * looking at a disk; a keyring that is locked and one that refused a write are
 * one problem to somebody looking at their keyring. Splitting them further
 * would produce messages that differ only by restating the error code, which
 * `failure.ts` already refuses to do.
 */
const BODIES: Partial<Record<IpcErrorCode, ParameterlessKey>> = {
  configDirUnavailable: 'editor.failed.body.file',
  settingsUnwritable: 'editor.failed.body.file',
  settingsUnreadable: 'editor.failed.body.file',
  settingsMalformed: 'editor.failed.body.file',
  keychainUnavailable: 'editor.failed.body.keychain',
  keychainWriteFailed: 'editor.failed.body.keychain',
  keychainReadFailed: 'editor.failed.body.keychain',
};

export function describeEditorFailure(failure: EditorFailure): EditorProblem {
  return {
    title: TITLES[failure.action],
    /* Anything else is ours, and says so. A message that guesses at a cause it
       does not have sends somebody to look at their disk for a bug in here. */
    body:
      failure.code === null
        ? 'editor.failed.body.core'
        : (BODIES[failure.code] ?? 'editor.failed.body.core'),
  };
}
