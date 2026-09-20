// @vitest-environment jsdom
//
// TypeScript's JSX excess-property check exempts `aria-*`/`data-*` attribute
// names from "does not exist on type" errors regardless of the target
// component's declared props, so a caller passing `aria-label`/`aria-pressed`
// to `Button` type-checked even while `ButtonProps` didn't declare either and
// `Button` never forwarded them to the underlying element: both were silently
// dropped at runtime, leaving every icon-only caller that relied on
// `aria-label` for its accessible name with none in the real DOM (#426).

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { Button } = await import('../src/components/ui/Button');

async function mount() {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(
      createElement(Button, {
        variant: 'ghost',
        size: 'icon',
        'aria-label': 'Close',
        'aria-pressed': true,
        children: createElement('svg', { className: 'h-2 w-2' }),
      }),
    );
  });

  const button = rootEl.querySelector('button');
  if (button === null) throw new Error('Button did not render a <button>');

  return {
    button,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootEl.remove();
    },
  };
}

describe('Button aria forwarding', () => {
  it('carries aria-label and aria-pressed onto the rendered element', async () => {
    const { button, unmount } = await mount();

    expect(button.getAttribute('aria-label')).toBe('Close');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    await unmount();
  });
});
