/**
 * The fallback path, forced.
 *
 * ADR-0006's follow-up asked for the DOM fallback to be exercised somewhere so
 * it does not rot, and it is the least-exercised code in the terminal: it only
 * runs on the machines we have least of. Left untested it would break quietly
 * and be discovered by whichever user has no GPU.
 *
 * What these cover is *our* decision and recovery, not `xterm.js` drawing —
 * that would need a browser, and a browser is a dependency this project has
 * not agreed to.
 */

import { describe, expect, it, vi } from 'vitest';

import { attachRenderer } from '../src/features/terminal/renderer';
import type { WebglLike } from '../src/features/terminal/renderer';

interface FakeTerminal {
  loadAddon: (addon: unknown) => void;
  loaded: unknown[];
}

/** A terminal that only records what was loaded into it. */
function fakeTerminal(): FakeTerminal {
  const loaded: unknown[] = [];
  return {
    loadAddon: (addon: unknown) => {
      loaded.push(addon);
    },
    loaded,
  };
}

/** An addon that works, and lets a test fire a context loss. */
function workingAddon(): { ctor: { new (): WebglLike }; lose: () => void; disposed: () => boolean } {
  let handler: (() => void) | null = null;
  let disposed = false;

  class Addon implements WebglLike {
    onContextLoss(next: () => void): void {
      handler = next;
    }
    dispose(): void {
      disposed = true;
    }
  }

  return {
    ctor: Addon,
    lose: () => handler?.(),
    disposed: () => disposed,
  };
}

describe('when WebGL works', () => {
  it('uses it, and says so', async () => {
    const terminal = fakeTerminal();
    const addon = workingAddon();

    const choice = await attachRenderer(terminal as never, undefined, async () => addon.ctor);

    expect(choice.kind).toBe('webgl');
    expect(choice.reason).toBeUndefined();
    expect(terminal.loaded).toHaveLength(1);
  });
});

describe('when WebGL is unavailable at startup', () => {
  it('falls back rather than throwing', async () => {
    /* A machine with no GPU, a virtual machine, a driver the webview cannot
       use. This is the common case on the platform ADR-0006 named, and it must
       not reach the caller as an exception. */
    const terminal = fakeTerminal();

    const choice = await attachRenderer(terminal as never, undefined, async () => {
      throw new Error('WebGL2 is not supported');
    });

    expect(choice.kind).toBe('dom');
    expect(terminal.loaded).toHaveLength(0);
  });

  it('explains itself, because a slower terminal deserves a reason', async () => {
    const choice = await attachRenderer(fakeTerminal() as never, undefined, async () => {
      throw new Error('WebGL2 is not supported');
    });

    expect(choice.reason).toContain('WebGL2 is not supported');
    expect(choice.reason).toContain('software');
  });

  it('survives a loader that throws something that is not an Error', async () => {
    const choice = await attachRenderer(fakeTerminal() as never, undefined, async () => {
      throw 'not an Error object';
    });

    expect(choice.kind).toBe('dom');
    expect(choice.reason).toBeDefined();
  });

  it('is safe to dispose even though nothing was attached', async () => {
    const choice = await attachRenderer(fakeTerminal() as never, undefined, async () => {
      throw new Error('nope');
    });

    expect(() => choice.dispose()).not.toThrow();
  });
});

describe('when the context is lost while running', () => {
  it('disposes the addon, which is the only way rendering resumes', async () => {
    /* The addon does not merely degrade after a context loss — it draws
       nothing. Leaving it attached leaves a blank terminal. */
    const terminal = fakeTerminal();
    const addon = workingAddon();

    await attachRenderer(terminal as never, undefined, async () => addon.ctor);
    expect(addon.disposed()).toBe(false);

    addon.lose();

    expect(addon.disposed()).toBe(true);
  });

  it('tells the interface, so the user is not left wondering', async () => {
    const addon = workingAddon();
    const told = vi.fn();

    await attachRenderer(fakeTerminal() as never, told, async () => addon.ctor);
    addon.lose();

    expect(told).toHaveBeenCalledOnce();
    expect(told.mock.calls[0]?.[0]).toContain('graphics context was lost');
  });
});
