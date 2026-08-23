/**
 * What happens when a window control is pressed, and what happens when the
 * window will not do it.
 *
 * Framework-free and separate from the hook on purpose. The bug this guards
 * was not a wrong message — it was `void closeWindow()`, a rejection nobody
 * caught, and a close button indistinguishable from one that was never wired
 * up. That is a fact about the wiring, so the wiring is what a test has to be
 * able to hold. Rendering a hook needs a DOM this project does not carry;
 * calling a function does not.
 */

import { asIpcError } from '../../ipc';

import type { WindowAction } from './controls';

/** The three things a titlebar control can ask the core to do. */
export interface WindowControls {
  readonly minimize: () => Promise<void>;
  readonly toggleMaximize: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * The refusal as the user sees it: a code, or a last resort.
 *
 * A rejection is not guaranteed to be one of ours — the bridge itself can fail
 * — and in that case something specific beats a code we invented, so the text
 * is shown and truncated rather than replaced. Nothing on this path carries a
 * secret: the arguments are an action name and a window the core already has.
 */
export function describeRefusal(rejection: unknown): string {
  return asIpcError(rejection)?.code ?? String(rejection).slice(0, 120);
}

/**
 * Presses a control, and reports back.
 *
 * `report(null)` happens first, always: a refusal that outlives the press that
 * caused it is a red bar the window keeps for the rest of its life.
 *
 * The returned promise never rejects. It resolves once the outcome has been
 * reported, which is what lets a test wait for it.
 */
export function actOnWindow(
  action: WindowAction,
  controls: WindowControls,
  report: (refusal: string | null) => void,
): Promise<void> {
  report(null);

  const done =
    action === 'minimize'
      ? controls.minimize()
      : action === 'close'
        ? controls.close()
        : controls.toggleMaximize();

  return done.catch((rejection: unknown) => {
    report(describeRefusal(rejection));
  });
}
