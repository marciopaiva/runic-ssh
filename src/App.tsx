import type { JSX } from 'react';

/**
 * The application shell.
 *
 * Deliberately almost empty. The titlebar, sidebar, terminal and status bar
 * each land with the issue that owns them, so this renders only enough to
 * prove the webview is mounted and the tokens are resolving.
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
        <circle
          cx="9.5"
          cy="12"
          r="7"
          className="stroke-brand-start"
          strokeWidth="1.2"
        />
        <circle
          cx="14.5"
          cy="12"
          r="7"
          className="stroke-brand-end"
          strokeWidth="1.2"
        />
        <path
          d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
          className="stroke-brand-rune"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <h1 className="text-ink text-lg font-semibold tracking-tight">Runic SSH</h1>
      <p className="text-ink-muted font-mono text-xs">
        shell mounted · no session yet
      </p>
    </main>
  );
}
