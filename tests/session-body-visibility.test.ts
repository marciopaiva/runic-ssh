// @vitest-environment jsdom
//
// `App.tsx`'s `boxOf` (App.tsx around line 957) returns `null` for a session
// that is not the active tab of its group, whether it sits behind another tab
// in the same group or is not shown in any group at all. `SessionBody` then
// gets `frame=WHOLE_AREA` (ADR-0014, so the terminal underneath keeps
// measuring something real) and mounts in the same sibling list `TerminalView`
// alone used to, in tab order rather than in on-screen order. A session added
// earlier can end up rendered after the one actually on screen, and with no
// visibility of its own that background body, facet bar included, paints over
// whatever is showing at full window size. This is what a maintainer reported
// as the Terminal/Tunnels bar "stretching past the app window".
//
// `TerminalView`, `TunnelsPanel` and `SessionFacets` are mocked out: this test
// is about `SessionBody`'s own root, not what its children render.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../src/components/TerminalView', () => ({ TerminalView: () => null }));
vi.mock('../src/components/TunnelsPanel', () => ({ TunnelsPanel: () => null }));
vi.mock('../src/components/SessionFacets', () => ({ SessionFacets: () => null }));

const { SessionBody } = await import('../src/components/SessionBody');

function props(visible: boolean) {
  return {
    visible,
    frame: {},
    forwards: [],
    adHocForwards: [],
    onAddAdHocForward: () => {},
    onRemoveAdHocForward: () => {},
    onEditHost: () => {},
    handle: null,
    session: null,
    sessions: [],
    focused: false,
    id: 'panel',
    labelledBy: 'tab',
    onPaneFocus: () => {},
    onSize: () => {},
    onFocusHandle: () => {},
    modifier: 'control' as const,
    onPasteNeedsConfirming: () => {},
    onInput: () => {},
    broadcasting: false,
  };
}

async function renderBody(visible: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(SessionBody, props(visible)));
  });

  const wrapper = container.firstElementChild;
  if (wrapper === null) throw new Error('SessionBody did not render a root element');

  return {
    wrapper,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('a session not on screen stays out of the way', () => {
  it('hides the whole body, facet bar included, when it is not the active tab of its group', async () => {
    const { wrapper, unmount } = await renderBody(false);

    expect(wrapper.className).toContain('invisible');
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');

    await unmount();
  });

  it('stays visible and reachable when it is the active tab', async () => {
    const { wrapper, unmount } = await renderBody(true);

    expect(wrapper.className).not.toContain('invisible');
    expect(wrapper.getAttribute('aria-hidden')).toBeNull();

    await unmount();
  });
});
