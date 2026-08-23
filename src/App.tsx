import { useCallback, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { CommandPalette } from './components/CommandPalette';
import { HostKeyBlocked } from './components/HostKeyBlocked';
import { ConnectionFailure } from './components/ConnectionFailure';
import { HostKeyPrompt } from './components/HostKeyPrompt';
import { HostKeyRefused } from './components/HostKeyRefused';
import { SessionEditor } from './components/SessionEditor';
import { SessionMenu } from './components/SessionMenu';
import { SessionsSidebar } from './components/SessionsSidebar';
import { StatusBar } from './components/StatusBar';
import { TerminalView } from './components/TerminalView';
import { Titlebar } from './components/Titlebar';
import { actionCommands, sessionCommands, usePalette } from './features/commands';
import type { CommandContext } from './features/commands';
import { openTabs, resolveActive, tabAfter, tabAfterClosing, useChrome, windowControls } from './features/chrome';
import { isOverridable, needsConfirmation, useConnect, useSessions } from './features/sessions';
import type { SessionAction } from './features/sessions';
import { deleteSession, disconnectSession, saveSession } from './ipc';
import type { SessionDraft } from './ipc';
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
  const { sessions, setState, attach, reload } = useSessions();
  const { chrome, maximized, act, refused, nativeDecorations, useNativeDecorations } = useChrome();
  const { i18n, chosen, choose } = useLocale();
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [size, setSize] = useState<TerminalSize | null>(null);
  /* `null` means closed; a string is the session being edited, and the empty
     string is a new one. A separate boolean would let "editing nothing" and
     "editing a session that has gone" look the same. */
  const [editing, setEditing] = useState<string | null>(null);
  /* Which row's menu is open, and where it was opened from. */
  const [menu, setMenu] = useState<{
    readonly sessionId: string;
    readonly at: { readonly x: number; readonly y: number };
  } | null>(null);

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

  const { attempt, connect, trust, abandon } = useConnect({
    onConnecting: (sessionId) => setState(sessionId, 'connecting'),
    onOpened: (sessionId, handle) => {
      attach(sessionId, handle);
      setState(sessionId, 'connected');
      setActive(sessionId);
    },
    onFailed: (sessionId, code) => {
      /* A changed key is not the same as an unreachable host, and the sidebar
         marker says which. Collapsing them would hide the one that matters. */
      setState(sessionId, code === 'hostKeyDecision' ? 'keyMismatch' : 'unreachable');
    },
  });

  /* Shown in the main area rather than as a toast: the user just clicked the
     session and is looking at exactly this space, and a message that
     disappears on its own is one that disappears before it is read. */
  const failedSession =
    attempt === null || attempt.stage.stage !== 'failed'
      ? null
      : (sessions.find((live) => live.session.id === attempt.sessionId)?.session ?? null);
  const failed =
    failedSession === null || attempt === null || attempt.stage.stage !== 'failed'
      ? null
      : { session: failedSession, code: attempt.stage.code };

  /* Activating a saved host is what starts a connection. An open one only
     switches, which is why the sidebar and the palette both route through
     here rather than each deciding for themselves. */
  const activate = useCallback(
    (sessionId: string): void => {
      setSelected(sessionId);

      const live = sessions.find((entry) => entry.session.id === sessionId);
      if (live === undefined) return;

      if (live.handle !== null) {
        setActive(sessionId);
        return;
      }

      void connect(sessionId, live.session.credentialId);
    },
    [connect, sessions],
  );

  const save = useCallback(
    (draft: SessionDraft): void => {
      void saveSession(draft)
        .then(() => reload())
        .finally(() => setEditing(null));
    },
    [reload],
  );

  const remove = useCallback(
    (sessionId: string): void => {
      void deleteSession(sessionId)
        .then(() => reload())
        .finally(() => setEditing(null));
    },
    [reload],
  );

  const chooseFromMenu = useCallback(
    (action: SessionAction): void => {
      const open = menu;
      setMenu(null);
      if (open === null) return;

      const live = sessions.find((entry) => entry.session.id === open.sessionId);

      switch (action) {
        case 'connect':
          activate(open.sessionId);
          return;
        case 'disconnect':
          if (live?.handle != null) {
            void disconnectSession(live.handle).finally(() => {
              attach(open.sessionId, null);
              setState(open.sessionId, 'saved');
            });
          }
          return;
        case 'edit':
          setEditing(open.sessionId);
          return;
        case 'delete':
          remove(open.sessionId);
          return;
      }
    },
    [menu, sessions, activate, attach, setState, remove],
  );

  const context = useMemo<CommandContext>(
    () => ({
      i18n,
      sessions,
      tabs,
      activeId,
      chosenLocale: chosen,
      maximized,
      nativeDecorations,
      actions: {
        newSession: () => setEditing(''),
        editSession: setEditing,
        selectSession: activate,
        activateTab: setActive,
        closeTab,
        moveTab: (step) => setActive(tabAfter(tabs, activeId, step)),
        window: act,
        chooseLocale: (locale) => void choose(locale),
        useNativeDecorations,
      },
    }),
    [i18n, sessions, tabs, activeId, chosen, maximized, nativeDecorations, act, choose, closeTab, activate, useNativeDecorations],
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
          onSelect={activate}
          onAdd={() => setEditing('')}
          onMenu={(sessionId, at) => setMenu({ sessionId, at })}
        />
        <main id={TERMINAL_PANEL} role="tabpanel" className="min-w-0 flex-1">
          {failed === null ? (
            <TerminalView handle={activeHandle} onSize={setSize} />
          ) : (
            <ConnectionFailure
              session={failed.session}
              code={failed.code}
              onRetry={() => activate(failed.session.id)}
              onDismiss={abandon}
            />
          )}
        </main>
      </div>

      {refused !== null && (
        /* A window control that could not act used to look exactly like one
           that was not wired up. */
        <p
          role="alert"
          className="bg-danger-soft text-danger-text border-line-subtle shrink-0 border-t px-3 py-1 text-center font-mono text-[11px]"
        >
          {refused}
        </p>
      )}

      <StatusBar
        kind={activeTab?.kind ?? null}
        stats={stats}
        size={size}
        modifier={chrome?.commandModifier ?? 'control'}
      />

      {attempt !== null &&
        attempt.stage.stage === 'deciding' &&
        attempt.decision !== null &&
        (!isOverridable(attempt.decision.verdict) ? (
          /* Revoked and certificate-required end in no decision, and used to
             render nothing at all — the attempt stopped behind an empty
             window. */
          <HostKeyRefused
            host={attempt.decision.host}
            fingerprint={attempt.decision.offered}
            reason={attempt.decision.verdict === 'revoked' ? 'revoked' : 'certificateRequired'}
            onCancel={abandon}
          />
        ) : needsConfirmation(attempt.decision.verdict) ? (
          <HostKeyBlocked
            host={attempt.decision.host}
            storedFingerprints={attempt.decision.stored}
            offeredFingerprint={attempt.decision.offered}
            onReplace={(confirmation) => void trust(confirmation)}
            onCancel={abandon}
          />
        ) : (
          <HostKeyPrompt
            host={attempt.decision.host}
            port={attempt.decision.port}
            keyType={attempt.decision.keyType}
            fingerprint={attempt.decision.offered}
            onTrust={() => void trust()}
            onCancel={abandon}
          />
        ))}

      {menu !== null &&
        (() => {
          const live = sessions.find((entry) => entry.session.id === menu.sessionId);
          if (live === undefined) return null;

          return (
            <SessionMenu
              live={live}
              at={menu.at}
              onChoose={chooseFromMenu}
              onDismiss={() => setMenu(null)}
            />
          );
        })()}

      {editing !== null && (
        <SessionEditor
          session={sessions.find((live) => live.session.id === editing)?.session ?? null}
          onSave={save}
          onDelete={editing === '' ? null : () => remove(editing)}
          onCancel={() => setEditing(null)}
        />
      )}

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
