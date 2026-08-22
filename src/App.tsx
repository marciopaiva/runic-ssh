import { useState } from 'react';
import type { JSX } from 'react';

import { SessionsSidebar } from './components/SessionsSidebar';
import { TerminalView } from './components/TerminalView';
import { useSessions } from './features/sessions';
import { useTranslator } from './features/settings';

/**
 * The application shell.
 *
 * Still mostly empty: the titlebar, sidebar and status bar each land with the
 * issue that owns them. What it does now is mount a terminal, so that the
 * streaming built behind it is something a person can look at.
 *
 * No session is open yet — connecting from the interface is the sidebar's job
 * — so the terminal mounts with no handle and waits.
 */
export function App(): JSX.Element {
  const i18n = useTranslator();
  const { sessions } = useSessions();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="border-line-subtle bg-surface-chrome flex items-center gap-2.5 border-b px-3 py-2">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          role="img"
          aria-label={i18n.t('app.name')}
        >
          <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.4" />
          <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.4" />
          <path
            d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
            className="stroke-brand-rune"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-ink text-[12.5px] font-semibold tracking-tight">
          {i18n.t('app.name')}
        </span>
        <span className="text-ink-faint font-mono text-[11px]">
          {i18n.t('app.shell.idle')}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <SessionsSidebar
          sessions={sessions}
          selectedId={selected}
          onSelect={setSelected}
          onAdd={() => {
            /* The editor lands with the command palette; until then the
               sidebar is a list, not a way to add to it. */
          }}
        />
        <main className="min-w-0 flex-1">
          <TerminalView handle={null} />
        </main>
      </div>
    </div>
  );
}
