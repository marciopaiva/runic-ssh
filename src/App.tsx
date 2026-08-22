import type { JSX } from 'react';

import { createTranslator } from './lib/i18n';

/**
 * The application shell.
 *
 * Deliberately almost empty. The titlebar, sidebar, terminal and status bar
 * each land with the issue that owns them, so this renders only enough to
 * prove the webview is mounted, the tokens resolve and the catalogue is wired.
 *
 * The locale is hard-coded here until detection and persistence land: this
 * reads the catalogue, it does not yet know which one the user wants.
 */
export function App(): JSX.Element {
  const i18n = createTranslator('en');

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label={i18n.t('app.name')}
      >
        <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.2" />
        <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.2" />
        <path
          d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
          className="stroke-brand-rune"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <h1 className="text-ink text-lg font-semibold tracking-tight">{i18n.t('app.name')}</h1>
      <p className="text-ink-muted font-mono text-xs">{i18n.t('app.shell.idle')}</p>
    </main>
  );
}
