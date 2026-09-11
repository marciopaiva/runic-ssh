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

/**
 * Which navigation is in front (ADR-0069): the four workspaces this project
 * has always had, or the two-slot rail ADR-0064 planned for after the cut,
 * reached without one. The same two names the core serializes;
 * `tests/ipc-contract.test.ts` pins them the way `Theme`'s are pinned.
 */
export type Shell = 'classic' | 'map';

export interface SettingsView {
  /** The locale the user chose, or `null` to follow the operating system. */
  readonly locale: string | null;
  /** Whether the window manager draws the title bar (ADR-0005's escape hatch). */
  readonly nativeDecorations: boolean;
  /** The palette the user chose, or `'system'` to follow the desktop. */
  readonly theme: Theme;
  /** Whether the preview features are revealed, the map among them (ADR-0066). */
  readonly previewFeatures: boolean;
  /** Which navigation is in front, classic or the map (ADR-0069). */
  readonly shell: Shell;
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

/** Reveals or hides the preview features, the map among them (ADR-0066). */
export async function setPreviewFeatures(on: boolean): Promise<SettingsView> {
  return invoke<SettingsView>('set_preview_features', { on });
}

/** Switches the shell: classic keeps the four workspaces this project has
    always had, map is the two-slot rail ADR-0064 planned for after the cut
    (ADR-0069). */
export async function setShell(shell: Shell): Promise<SettingsView> {
  return invoke<SettingsView>('set_shell', { shell });
}
