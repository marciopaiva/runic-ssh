import type { JSX } from 'react';

/**
 * The application shell.
 *
 * Deliberately almost empty. The titlebar, sidebar, terminal and status bar
 * each land with the issue that owns them, so this renders only enough to
 * prove the webview is mounted and the stylesheet is being applied.
 */
export function App(): JSX.Element {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label="Runic SSH"
      >
        <circle cx="9.5" cy="12" r="7" stroke="#2bb0e8" strokeWidth="1.2" />
        <circle cx="14.5" cy="12" r="7" stroke="#b961e6" strokeWidth="1.2" />
        <path
          d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
          stroke="#dbe7f5"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <h1 className="text-lg font-semibold tracking-tight">Runic SSH</h1>
      <p className="font-mono text-xs text-dim">shell mounted · no session yet</p>
    </main>
  );
}
