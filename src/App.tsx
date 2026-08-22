import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import type { TerminalSize } from './features/terminal/use-terminal';

import { SessionsSidebar } from './components/SessionsSidebar';
import { StatusBar } from './components/StatusBar';
import { TerminalView } from './components/TerminalView';
import { Titlebar } from './components/Titlebar';
import { openTabs, resolveActive, tabAfterClosing, useChrome, windowControls } from './features/chrome';
import { useSessions } from './features/sessions';
import { useSessionStats } from './features/status';

/** The element the tabs switch between. Named once, referenced from both ends. */
const TERMINAL_PANEL = 'terminal-panel';

/**
 * The application shell.
 *
 * The titlebar is the window's own, per ADR-0005: there are no decorations to
 * sit under on Windows and Linux, and on macOS the native traffic lights float
 * over it. The status bar and the command palette land with the issues that
 * own them.
 *
 * The tab strip is empty until something connects, which nothing in the
 * interface does yet — a tab means an open channel, and opening one needs the
 * credential prompt from ADR-0008.
 */
export function App(): JSX.Element {
  const { sessions } = useSessions();
  const { chrome, maximized, act } = useChrome();
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const tabs = useMemo(() => openTabs(sessions), [sessions]);
  /* A tab disappears when its host drops the connection, which nobody
     clicked. Resolving on render is what keeps the active tab pointing at
     something that is still there. */
  const activeId = resolveActive(tabs, active);
  const activeTab = tabs.find((tab) => tab.sessionId === activeId) ?? null;
  const activeHandle = activeTab?.handle ?? null;
  const stats = useSessionStats(activeHandle);
  const [size, setSize] = useState<TerminalSize | null>(null);

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        tabs={tabs}
        activeId={activeId}
        /* Until the core answers, the bar draws without controls. It is the
           same height either way, so nothing below it moves. */
        controls={chrome === null ? [] : windowControls(chrome, maximized)}
        leadingInset={chrome?.leadingInset ?? 0}
        panelId={TERMINAL_PANEL}
        onSelect={setActive}
        onClose={(sessionId) => setActive(tabAfterClosing(tabs, sessionId))}
        onAct={act}
      />

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
        <main
          id={TERMINAL_PANEL}
          role="tabpanel"
          className="min-w-0 flex-1"
        >
          <TerminalView handle={activeHandle} onSize={setSize} />
        </main>
      </div>

      <StatusBar
        kind={activeTab?.kind ?? null}
        stats={stats}
        size={size}
        /* Until the core answers, the hint reads Ctrl. The bar is the same
           height either way, and a macOS user sees the right glyph a
           millisecond later rather than a shifted layout. */
        modifier={chrome?.commandModifier ?? 'control'}
      />
    </div>
  );
}
