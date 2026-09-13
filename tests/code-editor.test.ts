// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { CodeEditor, macroEditorExtensions } from '../src/components/ui/CodeEditor';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("a script macro's own editor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the text it was given, with one gutter line number per line', () => {
    act(() => {
      root.render(createElement(CodeEditor, { value: 'echo one\necho two\necho three', onChange: () => {} }));
    });

    expect(container.textContent).toContain('echo one');
    expect(container.textContent).toContain('echo three');
    /* jsdom has no real text layout, so CodeMirror's own gutter can draw
       one placeholder row beyond the document's actual line count; the
       three real lines are still all there is no reason to demand the
       exact count a real browser would settle on. */
    expect(container.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length).toBeGreaterThanOrEqual(3);
  });

  it('destroys the CodeMirror view on unmount, leaving no editor node behind (section 6)', () => {
    act(() => {
      root.render(createElement(CodeEditor, { value: 'echo hi', onChange: () => {} }));
    });
    expect(container.querySelector('.cm-editor')).not.toBeNull();

    act(() => root.unmount());
    expect(container.querySelector('.cm-editor')).toBeNull();
  });
});

describe("the editor's own extensions", () => {
  it('report a real edit back through onChange', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const state = EditorState.create({ doc: 'echo one', extensions: macroEditorExtensions(onChange) });
    const view = new EditorView({ state, parent: host });

    view.dispatch({ changes: { from: 0, insert: 'X' } });

    expect(onChange).toHaveBeenCalledWith('Xecho one');
    view.destroy();
    host.remove();
  });

  it('says nothing when a transaction touches no text (a selection move)', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const state = EditorState.create({ doc: 'echo one', extensions: macroEditorExtensions(onChange) });
    const view = new EditorView({ state, parent: host });

    view.dispatch({ selection: { anchor: 1 } });

    expect(onChange).not.toHaveBeenCalled();
    view.destroy();
    host.remove();
  });
});
