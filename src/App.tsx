import { useCallback, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { CommandPalette } from './components/CommandPalette';
import { HostKeyBlocked } from './components/HostKeyBlocked';
import { ConnectionFailure } from './components/ConnectionFailure';
import { HostKeyPrompt } from './components/HostKeyPrompt';
import { HostKeyRefused } from './components/HostKeyRefused';
import { SessionMenu } from './components/SessionMenu';
import { SessionsSidebar } from './components/SessionsSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { TerminalView } from './components/TerminalView';
import { Titlebar } from './components/Titlebar';
import { actionCommands, sessionCommands, usePalette } from './features/commands';
import type { CommandContext } from './features/commands';
import { focusAfter, focusedSession, openTabs, resolveFocus, tabAfterClosing, useChrome, windowControls } from './features/chrome';
import type { Focus } from './features/chrome';
import { isOverridable, needsConfirmation, useConnect, useSessionEditor, useSessions } from './features/sessions';
import type { SessionAction } from './features/sessions';
import type { SettingsSection } from './components/SettingsPanel';
import { deleteSession, disconnectSession, saveSession } from './ipc';
import type { SessionDraft } from './ipc';
import { useLocale } from './features/settings';
import { useSessionStats } from './features/status';
import { mountedTerminals } from './features/terminal';
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
  /* What the strip is pointing at. A union rather than a session id with a
     reserved value for settings — see `features/chrome/focus.ts`. */
  const [focus, setFocus] = useState<Focus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [size, setSize] = useState<TerminalSize | null>(null);
  const [section, setSection] = useState<SettingsSection>('sessions');
  /* Which row's menu is open, and where it was opened from. */
  const [menu, setMenu] = useState<{
    readonly sessionId: string;
    readonly at: { readonly x: number; readonly y: number };
  } | null>(null);

  const tabs = useMemo(() => openTabs(sessions), [sessions]);
  /* A tab disappears when its host drops the connection, which nobody
     clicked. Resolving on render is what keeps the active tab pointing at
     something that is still there. */
  const resolvedFocus = resolveFocus(tabs, settingsOpen, focus);
  const activeId = focusedSession(resolvedFocus);
  const activeTab = tabs.find((tab) => tab.sessionId === activeId) ?? null;
  const activeHandle = activeTab?.handle ?? null;
  const stats = useSessionStats(activeHandle);
  /* One terminal per open session, kept mounted across tab switches. */
  const mounted = useMemo(() => mountedTerminals(tabs), [tabs]);

  const closeTab = useCallback(
    (sessionId: string) => {
      const next = tabAfterClosing(tabs, sessionId);
      /* Falling through to settings rather than to nothing: closing the last
         terminal with settings open used to leave the panel blank beside a
         tab that was still on the bar. */
      setFocus(next === null ? null : { kind: 'session', sessionId: next });
    },
    [tabs],
  );

  const openSettings = useCallback((): void => {
    setSettingsOpen(true);
    setFocus({ kind: 'settings' });
  }, []);

  const { attempt, connect, trust, abandon } = useConnect({
    onConnecting: (sessionId) => setState(sessionId, 'connecting'),
    onOpened: (sessionId, handle) => {
      attach(sessionId, handle);
      setState(sessionId, 'connected');
      setFocus({ kind: 'session', sessionId });
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
        setFocus({ kind: 'session', sessionId });
        return;
      }

      void connect(sessionId, live.session.credentialId);
    },
    [connect, sessions],
  );

  const save = useCallback(
    async (draft: SessionDraft) => {
      const stored = await saveSession(draft);
      reload();
      return stored;
    },
    [reload],
  );

  const remove = useCallback(
    (sessionId: string): void => {
      void deleteSession(sessionId).then(() => reload());
    },
    [reload],
  );

  const saved = useMemo(() => sessions.map((live) => live.session), [sessions]);

  const editor = useSessionEditor(saved, {
    onSave: save,
    onDelete: remove,
    onCloseSettings: () => setSettingsOpen(false),
  });

  /* Opening the form is what puts the tab on the strip: the sidebar's `+` and
     the row menu's Edit both land here rather than each knowing about tabs. */
  const editInSettings = useCallback(
    (target: Parameters<typeof editor.open>[0]): void => {
      setSettingsOpen(true);
      setSection('sessions');
      setFocus({ kind: 'settings' });
      editor.open(target);
    },
    [editor],
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
          editInSettings({ kind: 'existing', sessionId: open.sessionId });
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
        newSession: () => editInSettings({ kind: 'new' }),
        editSession: (sessionId: string) => editInSettings({ kind: 'existing', sessionId }),
        selectSession: activate,
        activateTab: (sessionId: string) => setFocus({ kind: 'session', sessionId }),
        closeTab,
        moveTab: (step) => setFocus(focusAfter(tabs, settingsOpen, resolvedFocus, step)),
        window: act,
        chooseLocale: (locale) => void choose(locale),
        useNativeDecorations,
        openSettings,
      },
    }),
    [i18n, sessions, tabs, activeId, chosen, maximized, nativeDecorations, act, choose, closeTab, activate, useNativeDecorations, openSettings, settingsOpen, resolvedFocus],
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
        focus={resolvedFocus}
        settingsOpen={settingsOpen}
        settingsDirty={editor.dirty}
        /* Until the core answers, the bar draws without controls. It is the
           same height either way, so nothing below it moves. */
        controls={chrome === null ? [] : windowControls(chrome, maximized)}
        leadingInset={chrome?.leadingInset ?? 0}
        panelId={TERMINAL_PANEL}
        onFocus={setFocus}
        onClose={closeTab}
        /* Through the editor rather than straight to the state: closing is
           one of the three things that can throw an unsaved form away. */
        onCloseSettings={editor.requestClose}
        onAct={act}
      />

      <div className="flex min-h-0 flex-1">
        <SessionsSidebar
          sessions={sessions}
          selectedId={selected}
          onSelect={activate}
          onAdd={() => editInSettings({ kind: 'new' })}
          onMenu={(sessionId, at) => setMenu({ sessionId, at })}
        />
        {/* `relative` is what the terminals are positioned against. They are
            stacked rather than swapped: one per session, only the active one
            visible, so switching tabs neither destroys an xterm nor makes the
            core open a second shell to replace it — ADR-0014. */}
        <main
          id={TERMINAL_PANEL}
          role="tabpanel"
          className="bg-surface-terminal relative min-w-0 flex-1"
        >
          {mounted.map((terminal) => (
            <TerminalView
              key={terminal.sessionId}
              handle={terminal.handle}
              visible={terminal.sessionId === activeId}
              onSize={setSize}
            />
          ))}

          {settingsOpen && (
            /* Mounted for as long as the tab is on the strip, and hidden the
               same way the terminals are, so the section you were reading is
               still the section you come back to. */
            <div
              className={`absolute inset-0 ${
                resolvedFocus?.kind === 'settings' ? '' : 'invisible pointer-events-none'
              }`}
              aria-hidden={resolvedFocus?.kind === 'settings' ? undefined : true}
            >
              <SettingsPanel
                section={section}
                onSection={setSection}
                sessionsSettings={{
                  sessions: saved,
                  editingId:
                    editor.target === null
                      ? null
                      : editor.target.kind === 'new'
                        ? 'new'
                        : editor.target.sessionId,
                  values: editor.values,
                  wrong: editor.wrong,
                  dirty: editor.dirty,
                  discarding: editor.discarding,
                  onEdit: (sessionId) => editor.open({ kind: 'existing', sessionId }),
                  onNew: () => editor.open({ kind: 'new' }),
                  onChange: editor.change,
                  onSubmit: editor.submit,
                  onDelete: editor.remove,
                  onConfirmDiscard: editor.confirmDiscard,
                  onCancelDiscard: editor.cancelDiscard,
                }}
                chosenLocale={chosen}
                onChooseLocale={(locale) => void choose(locale)}
                nativeDecorations={nativeDecorations}
                onUseNativeDecorations={useNativeDecorations}
              />
            </div>
          )}

          {failed !== null && (
            /* Positioned, and after the terminals in document order, so it
               paints over them. In normal flow it would be painted under
               every absolutely positioned sibling and never be seen. */
            <div className="absolute inset-0">
              <ConnectionFailure
                session={failed.session}
                code={failed.code}
                onRetry={() => activate(failed.session.id)}
                onDismiss={abandon}
              />
            </div>
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
