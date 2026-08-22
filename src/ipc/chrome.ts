/**
 * Typed wrappers over the window itself.
 *
 * The window is IPC even though it does not look like it: every call below is
 * a message to the core, and each one needs a permission in
 * `capabilities/default.json`. Keeping them here rather than in the titlebar
 * is what makes the whole privileged surface readable in one directory, per
 * section 6 of CLAUDE.md.
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

/** Who draws the minimise, maximise and close buttons. */
export type WindowControlsOwner = 'system' | 'application';

/**
 * The shape of the title area on this platform.
 *
 * Pinned against the Rust side in tests/ipc-contract.test.ts. Nothing at
 * runtime notices when a hand-written wire type drifts from what the core
 * sends.
 */
export interface WindowChrome {
  readonly controls: WindowControlsOwner;
  /** Pixels to keep clear at the leading edge, for controls we do not draw. */
  readonly leadingInset: number;
}

export async function windowChrome(): Promise<WindowChrome> {
  return invoke<WindowChrome>('window_chrome');
}

export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}

export async function isWindowMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

/**
 * Calls back whenever the window is resized.
 *
 * Which is how the maximise button learns it should now say restore. There is
 * no maximise event; a resize is the signal, and asking the window afterwards
 * is the answer.
 */
export async function onWindowResized(handler: () => void): Promise<UnlistenFn> {
  return getCurrentWindow().onResized(() => {
    handler();
  });
}
