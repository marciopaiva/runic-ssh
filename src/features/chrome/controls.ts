/**
 * The window control buttons, as data.
 *
 * ADR-0005 accepted "two chrome implementations and a per-platform layout
 * inset, in a surface that is purely cosmetic and therefore easy to
 * under-test". This file is the answer to the second half: the per-platform
 * part is a list, and a list can be asserted without a window to look at.
 */

import type { WindowChrome } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

export type WindowAction = 'minimize' | 'maximize' | 'restore' | 'close';

export interface WindowControl {
  readonly action: WindowAction;
  /**
   * Read aloud, and shown on hover. Parameterless by type: these are chosen at
   * runtime, and a message wanting a parameter would render its own braces.
   */
  readonly label: ParameterlessKey;
  /**
   * Whether losing the window is the outcome. Carried rather than inferred so
   * the styling and the meaning cannot drift apart.
   */
  readonly destructive: boolean;
}

const MINIMIZE: WindowControl = {
  action: 'minimize',
  label: 'window.minimize',
  destructive: false,
};

const MAXIMIZE: WindowControl = {
  action: 'maximize',
  label: 'window.maximize',
  destructive: false,
};

const RESTORE: WindowControl = {
  action: 'restore',
  label: 'window.restore',
  destructive: false,
};

const CLOSE: WindowControl = {
  action: 'close',
  label: 'window.close',
  destructive: true,
};

/**
 * The controls this platform expects the application to draw.
 *
 * Empty where the system draws its own: drawing a second set beside the
 * traffic lights is the failure mode ADR-0005 chose Option C to avoid.
 */
export function windowControls(
  chrome: WindowChrome,
  maximized: boolean,
): readonly WindowControl[] {
  if (chrome.controls === 'system') return [];

  return [MINIMIZE, maximized ? RESTORE : MAXIMIZE, CLOSE];
}
