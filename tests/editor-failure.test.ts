/**
 * The host form has to be able to say an action failed.
 *
 * `submitIn` had no `catch`, so a save the core refused was a rejected promise
 * nobody read and the form said nothing. What these pin is the mapping: which
 * sentence a reader gets, and that a code we did not anticipate is reported as
 * ours rather than sent to look at a disk. See #198.
 */

import { describe, expect, it } from 'vitest';

import { describeEditorFailure } from '../src/features/sessions/editor-failure';
import type { EditorAction } from '../src/features/sessions/editor-failure';
import type { IpcErrorCode } from '../src/ipc';

const ACTIONS: readonly EditorAction[] = ['save', 'delete', 'forget'];

describe('naming what did not happen', () => {
  it('names the action that was asked for, not the one that failed inside', () => {
    const titles = ACTIONS.map(
      (action) => describeEditorFailure({ action, code: 'settingsUnwritable' }).title,
    );

    expect(new Set(titles).size).toBe(ACTIONS.length);
  });
});

describe('saying why', () => {
  it('sends a file problem to the disk', () => {
    for (const code of [
      'configDirUnavailable',
      'settingsUnwritable',
      'settingsUnreadable',
      'settingsMalformed',
    ] as const) {
      expect(describeEditorFailure({ action: 'save', code }).body).toBe('editor.failed.body.file');
    }
  });

  it('sends a keychain problem to the keychain', () => {
    for (const code of [
      'keychainUnavailable',
      'keychainWriteFailed',
      'keychainReadFailed',
    ] as const) {
      expect(describeEditorFailure({ action: 'forget', code }).body).toBe(
        'editor.failed.body.keychain',
      );
    }
  });

  it('owns anything it did not anticipate', () => {
    /* The one that matters. A message that guesses at a cause it does not
       have sends somebody to look at their disk for a bug in here. */
    const unexpected: IpcErrorCode = 'malformedInput';

    expect(describeEditorFailure({ action: 'save', code: unexpected }).body).toBe(
      'editor.failed.body.core',
    );
  });

  it('owns a rejection that was not one of ours at all', () => {
    expect(describeEditorFailure({ action: 'save', code: null }).body).toBe(
      'editor.failed.body.core',
    );
  });
});
