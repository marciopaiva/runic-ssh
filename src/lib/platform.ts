/**
 * Whether this window is running on Linux, the one platform
 * `docs/measurements/terminal-menu-clipboard.md` measured: WebKitGTK's
 * `execCommand('paste')` does nothing there without the
 * `javascript-can-access-clipboard` setting, which Runic does not turn on.
 *
 * Reads `navigator.userAgent` rather than adding `@tauri-apps/plugin-os`
 * for one boolean; every webview Tauri ships already carries the platform
 * in it. Windows has not been measured and stays enabled until it is.
 */
export function isLinux(userAgent: string): boolean {
  return /\bLinux\b/.test(userAgent) && !/\bAndroid\b/.test(userAgent);
}
