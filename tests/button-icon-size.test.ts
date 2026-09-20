// @vitest-environment jsdom
//
// `Button`'s `sm`/`md`/`lg` sizes each bake in horizontal padding meant for a
// labeled button. An icon-only caller that also pins an exact box (e.g.
// `className="h-4 w-4"`) got that padding on top of the box: `cn()` merges
// classes within the same Tailwind group but not across groups, so padding
// and a fixed width both applied, leaving less content width than the icon
// needed. The icon sits in `Button`'s own `overflow-hidden` `truncate` span,
// whose flex "automatic minimum size" is 0, so it shrank to nothing instead
// of overflowing. `GroupStrip`'s close button and most of `SftpPane`'s nav
// bar hit this: the icon was rendered, but invisible (#425).
//
// `size="icon"` exists so an icon-only caller has a size with no padding to
// fight its own box, rather than every call site needing to know to cancel
// `sm`'s padding by hand.

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { Button } = await import('../src/components/ui/Button');

async function mount(size: 'sm' | 'icon') {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);

  await act(async () => {
    root.render(
      createElement(Button, {
        variant: 'ghost',
        size,
        className: 'h-4 w-4',
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

describe('Button icon size', () => {
  it('carries no padding that could starve a pinned icon box', async () => {
    const { button, unmount } = await mount('icon');

    expect(button.className).not.toContain('px-');
    expect(button.className).not.toContain('py-');
    expect(button.className).toContain('h-4');
    expect(button.className).toContain('w-4');

    await unmount();
  });

  it('leaves sm carrying the padding an icon box cannot afford', async () => {
    const { button, unmount } = await mount('sm');

    expect(button.className).toContain('px-2.5');
    expect(button.className).toContain('py-1');

    await unmount();
  });
});
