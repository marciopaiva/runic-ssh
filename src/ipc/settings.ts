/**
 * Typed wrapper over the settings commands.
 *
 * `invoke` appears in this directory and nowhere else, so the whole IPC surface
 * can be read in one place. Components call these functions.
 */

import { invoke } from '@tauri-apps/api/core';

export interface SettingsView {
  /** The locale the user chose, or `null` to follow the operating system. */
  readonly locale: string | null;
  /** Whether the window manager draws the title bar (ADR-0005's escape hatch). */
  readonly nativeDecorations: boolean;
}

export async function getSettings(): Promise<SettingsView> {
  return invoke<SettingsView>('get_settings');
}

/** Stores the chosen locale, or pass `null` to follow the system again. */
export async function setLocale(locale: string | null): Promise<SettingsView> {
  return invoke<SettingsView>('set_locale', { locale });
}
