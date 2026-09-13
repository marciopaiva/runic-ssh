/**
 * A small, line-numbered, shell-highlighted text editor (ADR-0070), built
 * on CodeMirror 6 rather than a plain `<textarea>`: a script macro's text
 * reads like a script, and a gutter alone did not.
 *
 * Hand-composed from the pieces actually needed, not the batteries-included
 * `codemirror` package: line numbers, a basic keymap with undo/redo, and
 * `@codemirror/legacy-modes`' shell stream language for highlighting. No
 * search, no folding, no autocomplete, since a macro's text has no use for
 * them.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/** What a caller can ask the editor to do from outside, the same reason
    `MacrosSidebar`'s own variable chips used to reach into the plain
    textarea's `selectionStart`/`selectionEnd`: CodeMirror keeps that state
    inside its own `EditorView`, not on a DOM node a ref alone exposes. */
export interface CodeEditorHandle {
  /** Inserts at the caret (replacing a selection, if there is one) and
      returns focus to the editor, the same as typing it would. */
  insertAtCursor: (text: string) => void;
}

/* Reads the app's own tokens (`tokens.css`) rather than fixed colors, so
   the editor stays in step with the theme it is drawn inside instead of
   carrying a second, unrelated palette. */
const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--rs-surface-terminal)',
      color: 'var(--rs-text-secondary)',
      fontSize: '11.5px',
      height: '100%',
    },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
    '.cm-content': { padding: '8px 0' },
    '.cm-gutters': {
      backgroundColor: 'var(--rs-surface-terminal)',
      color: 'var(--rs-text-disabled)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

/**
 * The extensions a macro's editor mounts with, apart from the component
 * that mounts them: kept separate so a test can drive a real CodeMirror
 * transaction and observe `onChange` without simulating DOM typing, which
 * CodeMirror's own input handling does not make reliable under jsdom.
 */
export function macroEditorExtensions(onChange: (value: string) => void) {
  return [
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    StreamLanguage.define(shell),
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
}

/**
 * Uncontrolled, the same shape the textarea it replaces already had: a
 * `value` read once, at mount, and every edit after that reported back
 * through `onChange` rather than fought back into CodeMirror's own state
 * on every keystroke.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, ariaLabel, className },
  handle,
) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = container.current;
    if (el === null) return undefined;

    const state = EditorState.create({
      doc: value,
      extensions: macroEditorExtensions((next) => onChangeRef.current(next)),
    });

    const instance = new EditorView({ state, parent: el });
    view.current = instance;

    /* The one thing this component owns past the render that created it:
       an `EditorView` keeps its own DOM and listeners alive until told
       otherwise (section 6). */
    return () => {
      view.current = null;
      instance.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    handle,
    () => ({
      insertAtCursor: (text) => {
        const instance = view.current;
        if (instance === null) return;
        const { from, to } = instance.state.selection.main;
        instance.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        instance.focus();
      },
    }),
    [],
  );

  return (
    <div
      ref={container}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      className={`overflow-hidden rounded border border-line-subtle ${className ?? ''}`}
    />
  );
});
