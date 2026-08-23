/**
 * Guards what happens when a window control cannot act.
 *
 * The application shipped with a close button that did nothing, and nobody
 * noticed for a release, because `void closeWindow()` discarded the rejection:
 * a refused control and an unwired control are the same observable event. So
 * the thing under test here is not the wording of a message — it is that the
 * rejection is still caught at all.
 *
 * ADR-0012 carried this as an open follow-up. Tauri's `MockRuntime` returns
 * `Ok` from every window operation, and a real window cannot be made to refuse
 * on demand, so the seam is the control object: hand `actOnWindow` one that
 * rejects, which no runtime will do for you.
 */

import { describe, expect, it } from 'vitest';

import { actOnWindow, describeRefusal } from '../src/features/chrome/refusal';
import type { WindowControls } from '../src/features/chrome/refusal';

/** Controls that answer, and record which one was pressed. */
function willing(): { controls: WindowControls; pressed: string[] } {
  const pressed: string[] = [];
  const note = (name: string) => async (): Promise<void> => {
    pressed.push(name);
  };

  return {
    pressed,
    controls: {
      minimize: note('minimize'),
      toggleMaximize: note('toggleMaximize'),
      close: note('close'),
    },
  };
}

/** Controls that refuse, the way a real window can and a mock will not. */
function refusing(rejection: unknown): WindowControls {
  const refuse = async (): Promise<void> => {
    throw rejection;
  };

  return { minimize: refuse, toggleMaximize: refuse, close: refuse };
}

describe('pressing a window control', () => {
  it('reports a refusal instead of swallowing it', async () => {
    /* The regression this file exists for. If the rejection is dropped again,
       `reported` keeps only the clearing null and this fails. */
    const reported: (string | null)[] = [];

    await actOnWindow('close', refusing({ code: 'windowActionRefused' }), (r) =>
      reported.push(r),
    );

    expect(reported).toEqual([null, 'windowActionRefused']);
  });

  it('reports one for every control, not just the one that broke', async () => {
    for (const action of ['minimize', 'maximize', 'restore', 'close'] as const) {
      const reported: (string | null)[] = [];
      await actOnWindow(action, refusing({ code: 'windowActionRefused' }), (r) =>
        reported.push(r),
      );

      expect(reported.at(-1), `${action} was not reported`).toBe('windowActionRefused');
    }
  });

  it('clears the last refusal before trying again', async () => {
    /* Without this, one failed press leaves a red bar the window keeps for
       the rest of its life. */
    const reported: (string | null)[] = [];
    const { controls } = willing();

    await actOnWindow('minimize', controls, (r) => reported.push(r));

    expect(reported).toEqual([null]);
  });

  it('presses the control the action names', async () => {
    /* A restore that minimises is a real bug and every control resolves the
       same way, so nothing else would catch it. */
    for (const [action, expected] of [
      ['minimize', 'minimize'],
      ['close', 'close'],
      ['maximize', 'toggleMaximize'],
      ['restore', 'toggleMaximize'],
    ] as const) {
      const { controls, pressed } = willing();
      await actOnWindow(action, controls, () => {});

      expect(pressed).toEqual([expected]);
    }
  });

  it('never rejects, whatever the control did', async () => {
    /* The caller is a click handler; an unhandled rejection there is an
       error in the console and nothing on screen. */
    await expect(
      actOnWindow('close', refusing(new Error('boom')), () => {}),
    ).resolves.toBeUndefined();
  });
});

describe('describing a refusal', () => {
  it('uses the code when the core sent one', () => {
    expect(describeRefusal({ code: 'windowActionRefused' })).toBe('windowActionRefused');
  });

  it('shows what it got when the rejection is not ours', () => {
    /* The bridge itself can fail, and then a code we invented would say less
       than the text does. */
    expect(describeRefusal(new Error('the bridge is gone'))).toContain('the bridge is gone');
  });

  it('truncates, so a long rejection cannot push the interface around', () => {
    expect(describeRefusal('x'.repeat(500))).toHaveLength(120);
  });
});
