// @vitest-environment jsdom
//
// SidebarOverlay hand-rolls what Dialog.tsx gets from HeadlessDialog for
// free: initial focus, Tab-cycling within the panel, focus restore on
// close, and Escape/backdrop close. It does that because Dialog's own
// Portal-to-`document.body` behavior (confirmed against @headlessui/react's
// compiled source) would place an `absolute`-positioned panel against the
// wrong containing block, breaking the anchor-to-content-row geometry
// ADR-0071 calls for. Dialog's own (untested, but library-backed) focus
// handling doesn't cover this hand-rolled substitute, so this file does.

import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { SidebarOverlay } = await import('../src/components/SidebarOverlay');

let containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers) container.remove();
  containers = [];
});

function dialog(container: HTMLElement) {
  return container.querySelector('[role="dialog"]');
}

async function renderOverlay(open: boolean, onClose: () => void, children: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(SidebarOverlay, { open, onClose, children }));
  });

  return {
    container,
    root,
    async setOpen(nextOpen: boolean) {
      await act(async () => {
        root.render(createElement(SidebarOverlay, { open: nextOpen, onClose, children }));
      });
    },
  };
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

describe('SidebarOverlay visibility', () => {
  it('renders nothing while closed', async () => {
    const { container, root } = await renderOverlay(false, () => {}, createElement('button', { type: 'button' }, 'First'));
    expect(dialog(container)).toBeNull();
    await unmount(root);
  });

  it('renders the panel and its children while open', async () => {
    const { container, root } = await renderOverlay(true, () => {}, createElement('button', { type: 'button' }, 'First'));
    const panel = dialog(container);
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toBe('First');
    await unmount(root);
  });
});

describe('SidebarOverlay closing', () => {
  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { container, root } = await renderOverlay(true, onClose, createElement('button', { type: 'button' }, 'First'));
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();

    await act(async () => {
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount(root);
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    const { root } = await renderOverlay(true, onClose, createElement('button', { type: 'button' }, 'First'));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount(root);
  });

  it('reads onClose through a ref, so a new onClose identity on re-render does not reset the Escape/backdrop wiring or steal focus back', async () => {
    // App.tsx passes an inline arrow for onClose, a fresh closure on most of
    // its renders. If the effect that wires Escape/backdrop depended on
    // onClose directly, every such render would re-run initial-focus setup
    // and yank focus out of whatever the person is mid-keystroke in.
    const firstOnClose = vi.fn();
    const children = createElement('button', { type: 'button' }, 'First');
    const { container, root, setOpen } = await renderOverlay(true, firstOnClose, children);
    const panel = dialog(container) as HTMLElement;
    const first = panel.querySelector('button') as HTMLElement;
    expect(document.activeElement).toBe(first);

    const second = document.createElement('input');
    document.body.appendChild(second);
    containers.push(second as unknown as HTMLElement);
    second.focus();
    expect(document.activeElement).toBe(second);

    const secondOnClose = vi.fn();
    await act(async () => {
      root.render(createElement(SidebarOverlay, { open: true, onClose: secondOnClose, children }));
    });

    // A re-render with open still true and a new onClose identity must not
    // have re-run the steal-initial-focus setup.
    expect(document.activeElement).toBe(second);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);

    await setOpen(false);
    await unmount(root);
  });
});

describe('SidebarOverlay focus management', () => {
  it('focuses the first focusable element inside the panel on open', async () => {
    const { container, root } = await renderOverlay(
      true,
      () => {},
      createElement(Fragment, null, createElement('button', { type: 'button' }, 'First'), createElement('button', { type: 'button' }, 'Second')),
    );
    const panel = dialog(container) as HTMLElement;
    const first = panel.querySelector('button');
    expect(document.activeElement).toBe(first);
    await unmount(root);
  });

  it('restores focus to the element that was focused before opening', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open sidebar';
    document.body.appendChild(trigger);
    containers.push(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { root, setOpen } = await renderOverlay(true, () => {}, createElement('button', { type: 'button' }, 'First'));
    expect(document.activeElement).not.toBe(trigger);

    await setOpen(false);
    expect(document.activeElement).toBe(trigger);

    await unmount(root);
  });

  it('cycles Tab from the last focusable element back to the first', async () => {
    const { container, root } = await renderOverlay(
      true,
      () => {},
      createElement(Fragment, null, createElement('button', { type: 'button' }, 'First'), createElement('button', { type: 'button' }, 'Second')),
    );
    const panel = dialog(container) as HTMLElement;
    const [first, second] = Array.from(panel.querySelectorAll('button'));
    second!.focus();
    expect(document.activeElement).toBe(second);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });

    expect(document.activeElement).toBe(first);
    await unmount(root);
  });

  it('cycles Shift+Tab from the first focusable element back to the last', async () => {
    const { container, root } = await renderOverlay(
      true,
      () => {},
      createElement(Fragment, null, createElement('button', { type: 'button' }, 'First'), createElement('button', { type: 'button' }, 'Second')),
    );
    const panel = dialog(container) as HTMLElement;
    const [, second] = Array.from(panel.querySelectorAll('button'));
    expect(document.activeElement).toBe(panel.querySelector('button'));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    });

    expect(document.activeElement).toBe(second);
    await unmount(root);
  });
});
