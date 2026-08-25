/**
 * Typed wrapper over the settings commands.
 *
 * `invoke` appears in this directory and nowhere else, so the whole IPC surface
 * can be read in one place. Components call these functions.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Which palette to paint, or to follow the desktop.
 *
 * The same three names the core serializes. `tests/ipc-contract.test.ts` pins
 * them against the Rust enum, because a variant renamed on one side is a theme
 * that stops being applied without anything failing to compile.
 */
export type Theme = 'system' | 'light' | 'dark';

export interface SettingsView {
  /** The locale the user chose, or `null` to follow the operating system. */
  readonly locale: string | null;
  /** Whether the window manager draws the title bar (ADR-0005's escape hatch). */
  readonly nativeDecorations: boolean;
  /** The palette the user chose, or `'system'` to follow the desktop. */
  readonly theme: Theme;
}

export async function getSettings(): Promise<SettingsView> {
  return invoke<SettingsView>('get_settings');
}

/** Stores the chosen locale, or pass `null` to follow the system again. */
export async function setLocale(locale: string | null): Promise<SettingsView> {
  return invoke<SettingsView>('set_locale', { locale });
}

/** Stores the chosen palette, or pass `'system'` to follow the desktop again. */
export async function setTheme(theme: Theme): Promise<SettingsView> {
  return invoke<SettingsView>('set_theme', { theme });
}
