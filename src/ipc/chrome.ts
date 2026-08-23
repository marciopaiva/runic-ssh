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

/** The modifier this platform expects on an application shortcut. */
export type CommandModifier = 'meta' | 'control';

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
  readonly commandModifier: CommandModifier;
}

export async function windowChrome(): Promise<WindowChrome> {
  return invoke<WindowChrome>('window_chrome');
}

/**
 * Acts on this window.
 *
 * Through a command of ours rather than through `@tauri-apps/api/window`. The
 * capability gets narrower — the webview no longer needs a permanent grant to
 * minimise, maximise or close — and a control that cannot be refused cannot
 * fail silently, which is what these did: the rejection was swallowed and the
 * button simply appeared not to work.
 *
 * Which window is not sent. The core acts on the one that called, so this
 * cannot name another: a label here would let the document that renders a
 * host's output close the credential prompt, which is the reach ADR-0008 keeps
 * away from it. The literals below are pinned in commands/chrome.rs.
 */
async function act(request: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> {
  return invoke<void>('window_action', { request });
}

export async function minimizeWindow(): Promise<void> {
  return act('minimize');
}

export async function toggleMaximizeWindow(): Promise<void> {
  return act('toggleMaximize');
}

export async function closeWindow(): Promise<void> {
  return act('close');
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
