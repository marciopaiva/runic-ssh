import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { CommandPalette } from './components/CommandPalette';
import { ConnectingSurface } from './components/ConnectingSurface';
import { EmptyPanel } from './components/EmptyPanel';
import { HostKeyBlocked } from './components/HostKeyBlocked';
import { ConnectionFailure } from './components/ConnectionFailure';
import { HostKeyPrompt } from './components/HostKeyPrompt';
import { HostKeyRefused } from './components/HostKeyRefused';
import { PasteConfirm } from './components/PasteConfirm';
import { SessionMenu } from './components/SessionMenu';
import { SessionEditorPanel } from './components/SessionEditorPanel';
import { SessionsSidebar } from './components/SessionsSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { TerminalView } from './components/TerminalView';
import { Titlebar } from './components/Titlebar';
import { actionCommands, sessionCommands, usePalette } from './features/commands';
import type { CommandContext } from './features/commands';
import { focusAfter, focusAfterClosing, focusedSession, openTabs, resolveFocus, sameFocus, stripEntries, useChrome, windowControls } from './features/chrome';
import type { Focus } from './features/chrome';
import {
  editorDirty,
  editorKey,
  findEditor,
  invalidFields,
  isInProgress,
  isOverridable,
  needsConfirmation,
  parsePort,
  settled,
  stateAfterFailure,
  suggestName,
  targetSession,
  typedInto,
  updateEditor,
  useConnect,
  useSessions,
  withEditor,
  withoutEditor,
} from './features/sessions';
import type { DraftValues, EditorTarget, OpenEditor, SessionAction } from './features/sessions';
import { preparePaste } from './features/terminal/clipboard';
import { deleteSession, disconnectSession, saveSession, sendInput } from './ipc';
import type { Session, SessionDraft } from './ipc';
import { useLocale } from './features/settings';
import { useSessionStats } from './features/status';
import {
  WHOLE_PANEL,
  inputTargets,
  mountedTerminals,
  paneCount,
  paneLabel,
  placeSession,
  resolveLayout,
  syncedPanes,
} from './features/terminal';
import type { Box, LayoutKind } from './features/terminal';
import type { PaneEdge } from './components/TerminalView';
import type { TerminalSize } from './features/terminal/use-terminal';

/** The element the tabs switch between. Named once, referenced from both ends. */
const TERMINAL_PANEL = 'terminal-panel';

/**
 * What a pane's edge should say.
 *
 * Nothing at all when the panel holds one terminal, so a window that has not
 * been split looks exactly as it did before panes existed. `synced` wins over
 * focus: with the switch armed every pane on screen is a destination, and which
 * one holds the keyboard is the less urgent fact.
 */
function paneEdge(
  layout: LayoutKind,
  onScreen: boolean,
  focused: boolean,
  syncing: boolean,
): PaneEdge {
  if (layout === 'single' || !onScreen) return 'none';
  if (syncing) return 'synced';
  return focused ? 'focused' : 'idle';
}

/** A pane's rectangle, as the browser wants it. Percentages of the panel. */
function paneStyle(box: Box): CSSProperties {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

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
  /* `closeFocus` runs before the handlers below and has to read the current
     forms. A ref rather than reordering the component: the handlers depend on
     `save` and `remove`, which depend on `reload`, and hoisting all of it to
     satisfy one call would be the worse trade. */
  const editorsRef = useRef<readonly OpenEditor[]>([]);
  const savedRef = useRef<readonly Session[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* Every host form that is open, in the order they were opened. One per host
     rather than one slot: the unsaved question then belongs to a host and not
     to a shared form, which is the shape #96 recorded and parked. The strip
     carries each target rather than a reserved id, so `{kind:'new'}` never has
     to pretend to be a session. */
  const [editors, setEditors] = useState<readonly OpenEditor[]>([]);
  const [size, setSize] = useState<TerminalSize | null>(null);
  /* Which row's menu is open, and where it was opened from. */
  const [menu, setMenu] = useState<{
    readonly sessionId: string;
    readonly at: { readonly x: number; readonly y: number };
  } | null>(null);
  /* A paste held back for an answer, and the session that asked. Held here
     rather than inside the terminal so it renders in that session's panel the
     way every other question does, per ADR-0015. */
  const [pendingPaste, setPendingPaste] = useState<{
    readonly sessionId: string;
    readonly text: string;
  } | null>(null);
  /* How the panel is divided, and which session sits in which slot. The slots
     are a hint rather than the truth: `resolveLayout` decides what is actually
     drawn, because a session leaves on its own when its host hangs up. */
  const [layout, setLayout] = useState<LayoutKind>('single');
  const [slots, setSlots] = useState<readonly (string | null)[]>([null]);
  /* Typing into every pane at once. Off by default and never persisted: this
     is the one switch in the application whose blast radius is more than the
     host being looked at. */
  const [sync, setSync] = useState(false);
  /* Panes turned off in their own header while the switch is armed. Three of
     four machines in a pool, with the database spared, is the ordinary case. */
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());

  const { attempt, connect, trust, abandon } = useConnect({
    onConnecting: (sessionId) => setState(sessionId, 'connecting'),
    onOpened: (sessionId, handle) => {
      attach(sessionId, handle);
      setState(sessionId, 'connected');
      setFocus({ kind: 'session', sessionId });
    },
    /* A changed key, a host that did not answer, and a credential window the
       user closed are three different things, and the marker says which. */
    onFailed: (sessionId, code) => setState(sessionId, stateAfterFailure(code)),
    /* Back to a plain stored host. Nothing was learned about it — the attempt
       was let go, not answered — so anything else would be a claim. */
    onAbandoned: (sessionId) => setState(sessionId, 'saved'),
  });

  /* The session an unresolved attempt names. It keeps its tab so that the
     surface asking about it has a panel to render in — ADR-0015. Dismissing
     the failure clears the attempt, and the tab goes with it. */
  const attentionId = attempt?.sessionId ?? null;
  const tabs = useMemo(() => openTabs(sessions, attentionId), [sessions, attentionId]);
  /* A tab disappears when its host drops the connection, which nobody
     clicked. Resolving on render is what keeps the active tab pointing at
     something that is still there. */
  const editing = useMemo(() => editors.map((editor) => editor.target), [editors]);
  const entries = useMemo(
    () => stripEntries(tabs, editing, settingsOpen),
    [tabs, editing, settingsOpen],
  );
  const resolvedFocus = resolveFocus(entries, focus);
  const activeId = focusedSession(resolvedFocus);
  const activeTab = tabs.find((tab) => tab.sessionId === activeId) ?? null;
  const activeHandle = activeTab?.handle ?? null;
  const stats = useSessionStats(activeHandle);
  /* One terminal per open session, kept mounted across tab switches. */
  const mounted = useMemo(() => mountedTerminals(tabs), [tabs]);
  const panes = useMemo(
    () => resolveLayout(layout, slots, tabs, activeId),
    [layout, slots, tabs, activeId],
  );
  const focusedAt = panes.findIndex((pane) => pane.sessionId === activeId);
  const filled = panes.filter((pane) => pane.sessionId !== null).length;
  const receiving = useMemo(() => syncedPanes(panes, muted), [panes, muted]);
  /* One pane left receiving is not a broadcast: it sends exactly where an
     unarmed keystroke goes, and the screen must not claim otherwise. */
  const armed = sync && receiving.length > 1;

  /* Nobody inherits a broadcast they did not arm. Moving the focus between
     panes leaves this alone; changing which hosts are in them does not. */
  const paneKey = panes.map((pane) => pane.sessionId ?? '').join('\u0000');
  const lastPaneKey = useRef(paneKey);
  useEffect(() => {
    if (lastPaneKey.current === paneKey) return;
    lastPaneKey.current = paneKey;
    setSync(false);
    setMuted(new Set());
  }, [paneKey]);

  /* Focus and the panes move together: picking a tab puts that session in the
     focused pane unless it is already on screen, in which case only the focus
     travels. One rule, applied wherever focus is set, so the strip cannot end
     up pointing at a session the panel is not drawing. */
  const focusOn = useCallback(
    (next: Focus | null): void => {
      const sessionId = focusedSession(next);
      if (sessionId !== null) {
        setSlots((current) => placeSession(current, focusedAt < 0 ? 0 : focusedAt, sessionId));
        /* The sidebar highlight follows too. It only ever moved on connecting,
           so looking at one session while the sidebar pointed at another was
           always possible and was hard to notice with one panel on screen. It
           is not hard to notice with four. Nothing reads it but the highlight
           itself, so one place saying "this is the one you are looking at"
           costs nothing and stops the two disagreeing. */
        setSelected(sessionId);
      }
      setFocus(next);
    },
    [focusedAt],
  );

  /* Where a keystroke goes, resolved for the terminal that produced it. */
  const broadcast = useCallback(
    (from: string, bytes: Uint8Array): void => {
      for (const sessionId of inputTargets(panes, from, sync, muted)) {
        const target = mounted.find((candidate) => candidate.sessionId === sessionId);
        if (target === undefined) continue;
        /* Rejections are caught and dropped on purpose. The input is split to
           stay inside what the core accepts, so what is left is a session that
           has ended, and `onClosed` already says so. A banner per keystroke
           after that would bury it. */
        void sendInput(target.handle, bytes).catch(() => {});
      }
    },
    [panes, sync, muted, mounted],
  );

  /* Which rectangle a session's surfaces belong in, or `null` when it is not
     on screen at all. ADR-0015 put a session's surfaces in that session's
     panel; with a split that panel is a pane, and the rule is otherwise the
     one it always was. */
  const boxOf = useCallback(
    (sessionId: string): Box | null =>
      panes.find((pane) => pane.sessionId === sessionId)?.box ?? null,
    [panes],
  );

  /* Changing the shape resizes the slots with it, and disarms the switch: the
     set of hosts receiving what you type has just changed. */
  const chooseLayout = useCallback((kind: LayoutKind): void => {
    setSlots((current) =>
      Array.from({ length: paneCount(kind) }, (_, at) => current[at] ?? null),
    );
    setLayout(kind);
    setSync(false);
    setMuted(new Set());
  }, []);

  /* Closing a connection, wherever it is asked for. The tab's X and the row
     menu both land here rather than each doing their own half of it. */
  const disconnect = useCallback(
    (sessionId: string): void => {
      const live = sessions.find((entry) => entry.session.id === sessionId);
      if (live?.handle == null) return;

      void disconnectSession(live.handle).finally(() => {
        attach(sessionId, null);
        setState(sessionId, 'saved');
      });
    },
    [sessions, attach, setState],
  );

  /* Closing any tab, whichever kind it is. One handler because the strip is
     one ring: the titlebar should not have to know that a session disconnects,
     an editor may have unsaved work, and settings just goes away. */
  const closeFocus = useCallback(
    (target: Focus): void => {
      if (target.kind === 'editor') {
        const open = findEditor(editorsRef.current, target.target);
        if (open === null) return;

        /* Unsaved work is answered for on the tab it is on. With a form per
           host, the question is finally about the host you are closing rather
           than about whichever form the one slot happened to hold. */
        if (editorDirty(open)) {
          setEditors((current) =>
            updateEditor(current, target.target, (editor) => ({ ...editor, discarding: true })),
          );
          setFocus(target);
          return;
        }

        setFocus(focusAfterClosing(entries, target));
        setEditors((current) => withoutEditor(current, target.target));
        return;
      }

      setFocus(focusAfterClosing(entries, target));

      if (target.kind === 'settings') {
        setSettingsOpen(false);
        return;
      }

      /* The part that was missing entirely. This moved the focus and stopped,
         so the X on a tab disconnected nothing, and the tab did not even go
         away — it is derived from the live session, which was still open. A
         control that looks like it did nothing is indistinguishable from one
         that is not wired up. */
      if (attentionId === target.sessionId) abandon();
      disconnect(target.sessionId);
    },
    [entries, attentionId, abandon, disconnect],
  );

  const openSettings = useCallback((): void => {
    setSettingsOpen(true);
    setFocus({ kind: 'settings' });
  }, []);

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
        focusOn({ kind: 'session', sessionId });
        return;
      }

      /* Already on its way. A double click on a row used to start a second
         connection to the same host: two sockets, the first orphaned, and with
         one attempt held at a time the first was silently replaced.
         `isInProgress` and not merely "has an attempt", because retrying from
         the failure surface is this same call on a session whose attempt is
         still held — and that one must go through. */
      if (attempt !== null && attempt.sessionId === sessionId && isInProgress(attempt.stage)) {
        focusOn({ kind: 'session', sessionId });
        return;
      }

      void connect(sessionId, live.session.credentialId);
    },
    [connect, sessions, attempt, focusOn],
  );

  /* What the attempt has to say, as one branch instead of four nested ones at
     the call site. Revoked and certificate-required end in no decision at all
     and used to render nothing — the attempt stopped behind an empty window. */
  const attemptSurface = ((): JSX.Element | null => {
    if (attempt === null) return null;

    const decision = attempt.stage.stage === 'deciding' ? attempt.decision : null;

    if (decision !== null) {
      if (!isOverridable(decision.verdict)) {
        return (
          <HostKeyRefused
            host={decision.host}
            fingerprint={decision.offered}
            reason={decision.verdict === 'revoked' ? 'revoked' : 'certificateRequired'}
            onCancel={abandon}
          />
        );
      }

      if (needsConfirmation(decision.verdict)) {
        return (
          <HostKeyBlocked
            host={decision.host}
            storedFingerprints={decision.stored}
            offeredFingerprint={decision.offered}
            onReplace={(confirmation) => void trust(confirmation)}
            onCancel={abandon}
          />
        );
      }

      return (
        <HostKeyPrompt
          host={decision.host}
          port={decision.port}
          keyType={decision.keyType}
          fingerprint={decision.offered}
          onTrust={() => void trust()}
          onCancel={abandon}
        />
      );
    }

    /* Only reached while the attempt is still running. A cancel here bumps the
       generation in `useConnect`, so the answer that eventually arrives is
       dropped rather than reopening this panel. */
    if (isInProgress(attempt.stage)) {
      const live = sessions.find((entry) => entry.session.id === attempt.sessionId);
      if (live === undefined) return null;

      return (
        <ConnectingSurface
          session={live.session}
          stage={attempt.stage.stage === 'authenticating' ? 'authenticating' : 'connecting'}
          onCancel={abandon}
        />
      );
    }

    if (failed !== null) {
      return (
        <ConnectionFailure
          session={failed.session}
          code={failed.code}
          onRetry={() => activate(failed.session.id)}
          onDismiss={abandon}
        />
      );
    }

    return null;
  })();

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

  /* What each form's tab says and whether it is holding unsaved work. The
     host's own name while it has one: a tab called "New session" that went on
     saying it after the host was saved would be lying about its contents. */
  const editorTabs = useMemo(
    () =>
      editors.map((editor) => ({
        target: editor.target,
        title:
          editor.target.kind === 'new'
            ? i18n.t('tabs.editor.new')
            : (targetSession(editor.target, saved)?.name ?? i18n.t('tabs.editor.new')),
        dirty: editorDirty(editor),
      })),
    [editors, saved, i18n],
  );

  editorsRef.current = editors;
  savedRef.current = saved;

  const changeIn = useCallback((target: EditorTarget, field: keyof DraftValues, value: string): void => {
    setEditors((current) => updateEditor(current, target, (editor) => typedInto(editor, field, value)));
  }, []);

  const submitIn = useCallback(
    (target: EditorTarget): void => {
      const open = findEditor(editorsRef.current, target);
      if (open === null) return;

      /* Named after the host if it was left blank, which is what somebody
         would type if the form insisted. */
      const filled = suggestName(open.values);
      const problems = invalidFields(filled);

      if (problems.length > 0) {
        setEditors((current) =>
          updateEditor(current, target, (editor) => ({ ...editor, values: filled, wrong: problems })),
        );
        return;
      }

      const port = parsePort(filled.port);
      if (port === null) return;

      const existing = targetSession(target, saved);

      void save({
        ...(existing === null ? {} : { id: existing.id }),
        name: filled.name.trim(),
        host: filled.host.trim(),
        port,
        user: filled.user.trim(),
        group: filled.group.trim() === '' ? null : filled.group.trim(),
      }).then((stored) => {
        /* Saving a host that did not exist closes the tab it was created on.
           The alternative is a tab that goes on saying "New session" while
           holding one already on disk — the tab lying about its own contents —
           and what somebody wants next is almost always to connect to it.
           Editing a host that already existed leaves the tab open, because
           there the name on it stays true. */
        if (target.kind === 'new') {
          setFocus(focusAfterClosing(entries, { kind: 'editor', target }));
          setEditors((current) => withoutEditor(current, target));
          return;
        }

        setEditors((current) => updateEditor(current, target, () => settled(stored)));
      });
    },
    [saved, save, entries],
  );

  const removeIn = useCallback(
    (target: EditorTarget): void => {
      if (target.kind === 'new') return;

      remove(target.sessionId);
      setFocus(focusAfterClosing(entries, { kind: 'editor', target }));
      setEditors((current) => withoutEditor(current, target));
    },
    [remove, entries],
  );

  const discardIn = useCallback(
    (target: EditorTarget, confirmed: boolean): void => {
      if (!confirmed) {
        setEditors((current) =>
          updateEditor(current, target, (editor) => ({ ...editor, discarding: false })),
        );
        return;
      }

      setFocus(focusAfterClosing(entries, { kind: 'editor', target }));
      setEditors((current) => withoutEditor(current, target));
    },
    [entries],
  );

  /* Opening the form is what puts its tab on the strip: the sidebar's `+` and
     the row menu's Edit both land here rather than each knowing about tabs. */
  const openEditor = useCallback(
    (target: EditorTarget): void => {
      setEditors((current) => withEditor(current, target, savedRef.current));
      setFocus({ kind: 'editor', target });
    },
    [],
  );

  const chooseFromMenu = useCallback(
    (action: SessionAction): void => {
      const open = menu;
      setMenu(null);
      if (open === null) return;

      switch (action) {
        case 'connect':
          activate(open.sessionId);
          return;
        case 'disconnect':
          disconnect(open.sessionId);
          return;
        case 'edit':
          openEditor({ kind: 'existing', sessionId: open.sessionId });
          return;
        case 'delete':
          remove(open.sessionId);
          return;
      }
    },
    [menu, activate, disconnect, openEditor, remove],
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
      layout,
      syncing: sync,
      panesFilled: filled,
      actions: {
        newSession: () => openEditor({ kind: 'new' }),
        editSession: (sessionId: string) => openEditor({ kind: 'existing', sessionId }),
        selectSession: activate,
        activateTab: (sessionId: string) => focusOn({ kind: 'session', sessionId }),
        closeTab: (sessionId: string) => closeFocus({ kind: 'session', sessionId }),
        moveTab: (step) => focusOn(focusAfter(entries, resolvedFocus, step)),
        splitPanel: chooseLayout,
        /* Arming always starts with every pane checked. Inheriting a set
           somebody narrowed for a different pair of hosts is the kind of thing
           this switch must never do. */
        toggleSync: () => {
          setMuted(new Set());
          setSync((on) => !on);
        },
        window: act,
        chooseLocale: (locale) => void choose(locale),
        useNativeDecorations,
        openSettings,
      },
    }),
    [i18n, sessions, tabs, activeId, chosen, maximized, nativeDecorations, act, choose, closeFocus, activate, useNativeDecorations, openSettings, settingsOpen, resolvedFocus, focusOn, entries, chooseLayout, layout, sync, filled, muted, armed, receiving],
  );

  const sources = useMemo(
    () => [() => sessionCommands(context), () => actionCommands(context)],
    [context],
  );

  const palette = usePalette(sources, chrome?.commandModifier ?? 'control');

  /* Built once per render rather than looked up per pane: the map is small,
     and four linear searches through the session list to draw four headers is
     the kind of thing that reads as fine and is not. */
  const paneLabels = useMemo(
    () => new Map(sessions.map((live) => [live.session.id, paneLabel(live.session)])),
    [sessions],
  );

  const pasteBox = pendingPaste === null ? null : boxOf(pendingPaste.sessionId);
  const attemptBox = attempt === null ? null : boxOf(attempt.sessionId);

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        entries={entries}
        tabs={tabs}
        focus={resolvedFocus}
        editorTabs={editorTabs}
        /* Until the core answers, the bar draws without controls. It is the
           same height either way, so nothing below it moves. */
        controls={chrome === null ? [] : windowControls(chrome, maximized)}
        leadingInset={chrome?.leadingInset ?? 0}
        panelId={TERMINAL_PANEL}
        onFocus={focusOn}
        /* One handler for the whole strip. Closing an editor goes through the
           hook, because that is one of the ways unsaved work gets thrown out. */
        onClose={closeFocus}
        onAct={act}
      />

      <div className="flex min-h-0 flex-1">
        <SessionsSidebar
          sessions={sessions}
          selectedId={selected}
          onSelect={activate}
          onAdd={() => openEditor({ kind: 'new' })}
          onMenu={(sessionId, at) => setMenu({ sessionId, at })}
        />
        {/* `relative` is what the terminals are positioned against. They are
            stacked rather than swapped: one per session, only the active one
            visible, so switching tabs neither destroys an xterm nor makes the
            core open a second shell to replace it — ADR-0014. */}
        <main
          id={TERMINAL_PANEL}
          role="tabpanel"
          /* `overflow-hidden` is not tidying. xterm sizes its screen to a whole
             number of rows, and the remainder — up to one cell height — is
             painted past the bottom of this box and over the status bar, which
             is where the bar appeared to be cut off. Clipping here bounds the
             terminal to its panel whatever the fit arithmetic rounds to. */
          className="bg-surface-terminal relative min-w-0 flex-1 overflow-hidden"
        >
          {mounted.map((terminal) => {
            const at = panes.findIndex((pane) => pane.sessionId === terminal.sessionId);
            const onScreen = at >= 0;
            const isFocused = terminal.sessionId === activeId;

            return (
              <TerminalView
                key={terminal.sessionId}
                handle={terminal.handle}
                visible={onScreen}
                focused={isFocused}
                /* Off screen it keeps the whole panel, so `FitAddon` and the
                   resize observer go on measuring something real — ADR-0014. */
                box={panes[at]?.box ?? WHOLE_PANEL}
                edge={paneEdge(layout, onScreen, isFocused, armed && !muted.has(terminal.sessionId))}
                label={
                  layout === 'single' || !onScreen
                    ? null
                    : (paneLabels.get(terminal.sessionId) ?? null)
                }
                /* Absent unless something is being broadcast, and absent off
                   screen: a control for a pane nobody can see decides nothing. */
                receiving={sync && onScreen && layout !== 'single' ? !muted.has(terminal.sessionId) : null}
                onToggleReceiving={() =>
                  setMuted((current) => {
                    const next = new Set(current);
                    if (next.has(terminal.sessionId)) next.delete(terminal.sessionId);
                    else next.add(terminal.sessionId);
                    return next;
                  })
                }
                onPaneFocus={() => focusOn({ kind: 'session', sessionId: terminal.sessionId })}
                onSize={setSize}
                modifier={chrome?.commandModifier ?? 'control'}
                onPasteNeedsConfirming={(text) =>
                  setPendingPaste({ sessionId: terminal.sessionId, text })
                }
                onInput={(bytes) => broadcast(terminal.sessionId, bytes)}
                broadcasting={armed && !muted.has(terminal.sessionId)}
              />
            );
          })}

          {/* A slot with nothing in it yet. Dashed rather than solid so it
              reads as somewhere to put a session and not as a terminal that
              failed to paint, which is the same worry the empty panel below
              was written for. */}
          {layout !== 'single' &&
            panes.map((pane, at) =>
              pane.sessionId === null ? (
                <div
                  key={`slot-${String(at)}`}
                  className="border-line-subtle absolute border-2 border-dashed"
                  style={paneStyle(pane.box)}
                >
                  <EmptyPanel modifier={chrome?.commandModifier ?? 'control'} variant="pane" />
                </div>
              ) : null,
            )}

          {/* Nothing open at all. A blank panel beside a blank tab strip is
              indistinguishable from a window that failed to paint, and it is
              the first thing a new user meets. */}
          {entries.length === 0 && attemptSurface === null && (
            <div className="absolute inset-0">
              <EmptyPanel modifier={chrome?.commandModifier ?? 'control'} />
            </div>
          )}

          {editors.map((open) => {
            const mine: Focus = { kind: 'editor', target: open.target };
            const showing = sameFocus(resolvedFocus, mine);

            return (
              /* One panel per open form, all mounted, only the focused one
                 visible — the same trick the terminals use. A half-typed host
                 survives a glance at a session and is still there on the way
                 back, and now so does the *other* half-typed host. */
              <div
                key={editorKey(open.target)}
                className={`absolute inset-0 overflow-y-auto ${
                  showing ? '' : 'invisible pointer-events-none'
                }`}
                aria-hidden={showing ? undefined : true}
              >
                <SessionEditorPanel
                  title={
                    editorTabs.find((candidate) => sameFocus({ kind: 'editor', target: candidate.target }, mine))
                      ?.title ?? ''
                  }
                  isNew={open.target.kind === 'new'}
                  values={open.values}
                  wrong={open.wrong}
                  discarding={open.discarding}
                  onChange={(field, value) => changeIn(open.target, field, value)}
                  onSubmit={() => submitIn(open.target)}
                  onDelete={() => removeIn(open.target)}
                  onConfirmDiscard={() => discardIn(open.target, true)}
                  onCancelDiscard={() => discardIn(open.target, false)}
                />
              </div>
            );
          })}

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
                chosenLocale={chosen}
                onChooseLocale={(locale) => void choose(locale)}
                nativeDecorations={nativeDecorations}
                onUseNativeDecorations={useNativeDecorations}
              />
            </div>
          )}

          {/* A paste waiting on an answer, in the pane of the session that
              asked. Ahead of the attempt surface in document order because a
              session with a terminal to paste into is not one that has an
              attempt still running. */}
          {pendingPaste !== null && pasteBox !== null && (
            <div className="absolute" style={paneStyle(pasteBox)}>
              <PasteConfirm
                text={pendingPaste.text}
                hosts={inputTargets(panes, pendingPaste.sessionId, sync, muted).length}
                onCancel={() => setPendingPaste(null)}
                onConfirm={() => {
                  /* Through the same fan-out a keystroke takes, so a confirmed
                     paste reaches exactly the hosts the question named. */
                  broadcast(
                    pendingPaste.sessionId,
                    new TextEncoder().encode(preparePaste(pendingPaste.text)),
                  );
                  setPendingPaste(null);
                }}
              />
            </div>
          )}

          {/* Everything an attempt has to say, inside the pane of the session
              it names — ADR-0015. Positioned and last in document order so it
              paints over that session's terminal, and bounded to that pane, so
              a question about one session cannot cover another. Absent
              entirely when its session is in no pane: there is nowhere honest
              to draw it, and the tab is still on the strip. */}
          {attempt !== null && attemptSurface !== null && attemptBox !== null && (
            <div className="absolute" style={paneStyle(attemptBox)}>
              {attemptSurface}
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
        syncing={armed ? receiving.length : null}
        onStopSync={() => {
          setSync(false);
          setMuted(new Set());
        }}
      />

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
