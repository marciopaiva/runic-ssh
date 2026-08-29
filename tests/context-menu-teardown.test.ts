/**
 * `refuseNavigationMenu`'s own registration, unregistered on the call it
 * returns.
 *
 * Section 6 asks for a teardown path and a test that proves it runs. This one
 * needs no jsdom: `context-menu.ts` already says there is none in this
 * repository to mount into, so the target is a plain object shaped like a
 * `Document`, the same trick `context-menu.test.ts` uses for `MenuTarget`.
 */

import { describe, expect, it, vi } from 'vitest';

import { refuseNavigationMenu } from '../src/features/chrome/context-menu';

function fakeDocument(): Document {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Document;
}

describe('what taking the rule off releases', () => {
  it('removes exactly the listener it added', () => {
    /* Not just that a call was made: the listener passed to
       `removeEventListener` has to be the exact function `addEventListener`
       was given, or a real `Document` keeps the old one registered under a
       name that matches nothing. */
    const root = fakeDocument();

    const stop = refuseNavigationMenu(root);

    expect(root.addEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    const registered = vi.mocked(root.addEventListener).mock.calls[0]?.[1];

    stop();

    expect(root.removeEventListener).toHaveBeenCalledWith('contextmenu', registered);
  });
});
