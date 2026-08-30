/**
 * Typed wrapper over the build-identity command.
 *
 * `invoke` appears in this directory and nowhere else, so the whole IPC surface
 * can be read in one place. Components call these functions.
 */

import { invoke } from '@tauri-apps/api/core';

/** The version this process was built with, e.g. `"0.2.1"`. */
export async function appVersion(): Promise<string> {
  return invoke<string>('app_version');
}
