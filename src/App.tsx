import { useCallback, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { CommandPalette } from './components/CommandPalette';
import { SessionsSidebar } from './components/SessionsSidebar';
import { StatusBar } from './components/StatusBar';
import { TerminalView } from './components/TerminalView';
import { Titlebar } from './components/Titlebar';
import { actionCommands, sessionCommands, usePalette } from './features/commands';
import type { CommandContext } from './features/commands';
import { openTabs, resolveActive, tabAfter, tabAfterClosing, useChrome, windowControls } from './features/chrome';
import { useSessions } from './features/sessions';
import { useLocale } from './features/settings';
import { useSessionStats } from './features/status';
import type { TerminalSize } from './features/terminal/use-terminal';

/** The element the tabs switch between. Named once, referenced from both ends. */
const TERMINAL_PANEL = 'terminal-panel';

/**
 * The application shell.
 *
 * The titlebar is the window's own, per ADR-0005. The palette reaches
 * everything through one registry, which is why it exists this early: a
 * registry added after the fact only ever sees the parts somebody remembered
 * to register.
 *
 * The tab strip is empty until something connects, which nothing in the
 * interface does yet — a tab means an open channel, and opening one needs the
 * credential prompt from ADR-0008.
 */
export function App(): JSX.Element {
  const { sessions } = useSessions();
  const { chrome, maximized, act } = useChrome();
  const { i18n, chosen, choose } = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [size, setSize] = useState<TerminalSize | null>(null);

  const tabs = useMemo(() => openTabs(sessions), [sessions]);
  /* A tab disappears when its host drops the connection, which nobody
     clicked. Resolving on render is what keeps the active tab pointing at
     something that is still there. */
  const activeId = resolveActive(tabs, active);
  const activeTab = tabs.find((tab) => tab.sessionId === activeId) ?? null;
  const activeHandle = activeTab?.handle ?? null;
  const stats = useSessionStats(activeHandle);

  const closeTab = useCallback(
    (sessionId: string) => setActive(tabAfterClosing(tabs, sessionId)),
    [tabs],
  );

  const context = useMemo<CommandContext>(
    () => ({
      i18n,
      sessions,
      tabs,
      activeId,
      chosenLocale: chosen,
      maximized,
      actions: {
        selectSession: setSelected,
        activateTab: setActive,
        closeTab,
        moveTab: (step) => setActive(tabAfter(tabs, activeId, step)),
        window: act,
        chooseLocale: (locale) => void choose(locale),
      },
    }),
    [i18n, sessions, tabs, activeId, chosen, maximized, act, choose, closeTab],
  );

  const sources = useMemo(
    () => [() => sessionCommands(context), () => actionCommands(context)],
    [context],
  );

  const palette = usePalette(sources, chrome?.commandModifier ?? 'control');

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
        onClose={closeTab}
        onAct={act}
      />

      <div className="flex min-h-0 flex-1">
        <SessionsSidebar
          sessions={sessions}
          selectedId={selected}
          onSelect={setSelected}
          onAdd={palette.show}
        />
        <main id={TERMINAL_PANEL} role="tabpanel" className="min-w-0 flex-1">
          <TerminalView handle={activeHandle} onSize={setSize} />
        </main>
      </div>

      <StatusBar
        kind={activeTab?.kind ?? null}
        stats={stats}
        size={size}
        modifier={chrome?.commandModifier ?? 'control'}
      />

      <CommandPalette
        open={palette.open}
        query={palette.query}
        matches={palette.matches}
        selected={palette.selected}
        onQuery={palette.setQuery}
        onMove={palette.move}
        onSelect={palette.select}
        onRun={palette.run}
        onDismiss={palette.dismiss}
      />
    </div>
  );
}
