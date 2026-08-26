import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { ActivityRail } from './components/ActivityRail';
import { CommandPalette } from './components/CommandPalette';
import { ConnectingSurface } from './components/ConnectingSurface';
import { EmptyPanel } from './components/EmptyPanel';
import { GroupMenu } from './components/GroupMenu';
import { GroupStrip, entryTitle } from './components/GroupStrip';
import type { GroupMenuItem } from './components/GroupMenu';
import { HostKeyBlocked } from './components/HostKeyBlocked';
import { ConnectionFailure } from './components/ConnectionFailure';
import { CredentialSaved } from './components/CredentialSaved';
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
import {
  focusAfter,
  focusAfterClosing,
  focusedSession,
  openTabs,
  panelElementId,
  resolveFocus,
  sameFocus,
  stripEntries,
  tabElementId,
  useChrome,
  windowControls,
} from './features/chrome';
import type { Focus } from './features/chrome';
import {
  carrierName,
  editorDirty,
  editorKey,
  findEditor,
  invalidFields,
  isInProgress,
  isOverridable,
  markCarried,
  needsConfirmation,
  hasStoredCredential,
  jumpHostChoice,
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
import type {
  CarriedOn,
  DraftField,
  DraftValues,
  EditorTarget,
  OpenEditor,
  SessionAction,
} from './features/sessions';
import { preparePaste } from './features/terminal/clipboard';
import { deleteSession, disconnectSession, forgetCredential, saveSession, sendInput } from './ipc';
import type { Session, SessionDraft } from './ipc';
import { useLocale, useTheme } from './features/settings';
import { announceBroadcast, useSessionStats } from './features/status';
import type { Announcement } from './features/status';
import {
  WHOLE_AREA,
  activeEntry,
  gridCount,
  groupLabel,
  groupOf,
  inputTargets,
  mountedTerminals,
  moveEntry,
  placeEntry,
  receivingSessions,
  removeEntry,
  resolveGroups,
  sparedSessions,
} from './features/terminal';
import type { Box, Grid, Group, HeldGroup } from './features/terminal';
import type { TerminalSize } from './features/terminal/use-terminal';

/**
 * A group's tab strip, and the border around the whole group.
 *
 * Both are wanted as numbers rather than classes because a group's body is a
 * percentage of the main area with these taken off it, and there is no utility
 * for "half of whatever this panel is, less thirty pixels".
 */
const STRIP_HEIGHT = 28;
const GROUP_EDGE = 2;

/**
 * What the border around a group says about it.
 *
 * `none` is the window that has not been split, and it is a border in the same
 * colour as the group rather than no border at all: the terminal inside is
 * positioned against these numbers, so a shape that appears on splitting would
 * move every terminal by two pixels.
 *
 * `synced` wins over focus. With the switch armed every group on screen is a
 * destination, and which one holds the keyboard is the less urgent fact.
 */
type GroupEdge = 'none' | 'idle' | 'focused' | 'synced';

const EDGES: Readonly<Record<GroupEdge, string>> = {
  none: 'border-2 border-transparent',
  idle: 'border-2 border-line-subtle',
  focused: 'border-2 border-accent',
  synced: 'border-2 border-warn',
};

function groupEdge(layout: Grid, focused: boolean, syncing: boolean): GroupEdge {
  if (layout === '1x1') return 'none';
  if (syncing) return 'synced';
  return focused ? 'focused' : 'idle';
}

/** A group's rectangle, border included. Percentages of the main area. */
function frameStyle(box: Box): CSSProperties {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

/**
 * Where a group's active tab draws: inside the border, below the strip.
 *
 * Not a child of the group. A terminal that changed parent on the way from one
 * group to the next would be unmounted and mounted again, which is precisely
 * what ADR-0014 exists to prevent, so every surface is a sibling positioned by
 * arithmetic instead.
 */
function bodyStyle(box: Box): CSSProperties {
  const top = STRIP_HEIGHT + GROUP_EDGE;

  return {
    left: `calc(${box.left}% + ${GROUP_EDGE}px)`,
    top: `calc(${box.top}% + ${top}px)`,
    width: `calc(${box.width}% - ${GROUP_EDGE * 2}px)`,
    height: `calc(${box.height}% - ${top + GROUP_EDGE}px)`,
  };
}

/**
 * What is being dragged towards a rectangle.
 *
 * Two things can be, and they are different: a tab is already open somewhere
 * and moves, a host from the list may not be open at all and is connected. The
 * drop is one gesture and the answer to it is not, so the difference is
 * carried here rather than worked out at the moment of landing.
 */
type Dragged =
  | { readonly kind: 'tab'; readonly entry: Focus }
  | { readonly kind: 'host'; readonly sessionId: string };

/** The session a group is showing, or `null` when it is showing something else. */
function shownSession(group: Group): string | null {
  const entry = activeEntry(group);
  return entry?.kind === 'session' ? entry.sessionId : null;
}

/**
 * The application shell.
 *
 * ADR-0020 fixed the anatomy: a 36px top strip of mark, drag surface and
 * window controls; a rail of activities that never closes; the session list
 * beside it, which does; and a main area of groups, each one a strip of tabs
 * over the body of whichever tab it is showing.
 *
 * The three surfaces the window can open are one kind of thing here. A
 * terminal, a host form and the settings page are all `Focus` values, all held
 * by a group, and all positioned by the same arithmetic. That is rule 3, and
 * it cost nothing because the union predates the rule.
 *
 * The titlebar is the window's own, per ADR-0005. The palette reaches
 * everything through one registry, which is why it exists this early: a
 * registry added after the fact only ever sees the parts somebody remembered
 * to register.
 */
export function App(): JSX.Element {
  const { sessions, setState, attach, reload } = useSessions();
  const { chrome, maximized, act, refused, nativeDecorations, useNativeDecorations } = useChrome();
  const { i18n, chosen, choose } = useLocale();
  const { theme, chooseTheme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  /* Whether the session list is beside the rail. ADR-0020 rule 4: this closes
     and the rail does not, so the icon that closed it is the way back and the
     window has no state where the list is gone with nothing offering it. */
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  /* A group's menu: which group it belongs to, which of its tabs it is about,
     and where it was opened from. The tab is carried rather than looked up,
     because right-clicking a background tab opens this about that tab and not
     about the one the group happens to be showing. */
  const [groupMenu, setGroupMenu] = useState<{
    readonly group: number;
    readonly entry: Focus | null;
    readonly at: { readonly x: number; readonly y: number };
  } | null>(null);
  /* A tab being dragged, and the rectangle the pointer is over. Held here
     rather than in `dataTransfer`, which is readable by anything the window is
     dropped on and writable by anything dropped into it: a file dragged in
     from a file manager must never be able to look like a tab. */
  const [dragging, setDragging] = useState<Dragged | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  /* A paste held back for an answer, and the session that asked. Held here
     rather than inside the terminal so it renders in that session's panel the
     way every other question does, per ADR-0015. */
  const [pendingPaste, setPendingPaste] = useState<{
    readonly sessionId: string;
    readonly text: string;
  } | null>(null);
  /* How the area is divided, and what each group holds. What is held is a hint
     rather than the truth: `resolveGroups` decides what is actually drawn,
     because a session leaves on its own when its host hangs up. */
  const [layout, setLayout] = useState<Grid>('1x1');
  const [held, setHeld] = useState<readonly HeldGroup[]>([{ entries: [], activeAt: -1 }]);
  /* Typing into every pane at once. Off by default and never persisted: this
     is the one switch in the application whose blast radius is more than the
     host being looked at. */
  const [sync, setSync] = useState(false);
  /* Panes turned off in their own header while the switch is armed. Three of
     four machines in a pool, with the database spared, is the ordinary case. */
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  /* Sessions whose credential the user asked to keep and the store refused.
     Held for the life of the session rather than shown once and forgotten: the
     fact stays true, and a message that leaves before it is read is the thing
     ADR-0015 argues against. See #167. */
  /* Which sessions have a refusal to report, and whose it was: `null` for the
     session's own credential, a jump host's name when it happened one hop
     away. A map rather than a set because the two need different sentences,
     and the second one has to name the host the user cannot see. */
  const [unsaved, setUnsaved] = useState<ReadonlyMap<string, string | null>>(new Map());
  /* Which host each open session is riding, when it is riding one. Written
     once, when the session opens, and left alone afterwards: it is a fact
     about a connection that exists, not about what the session file says now.
     Entries for sessions that have since closed mark nothing, because
     `markCarried` counts only the ones still holding a handle. See #168. */
  const [carriedOn, setCarriedOn] = useState<ReadonlyMap<string, CarriedOn>>(new Map());

  const { attempt, connect, trust, abandon } = useConnect({
    onConnecting: (sessionId) => setState(sessionId, 'connecting'),
    onOpened: (sessionId, handle, via) => {
      attach(sessionId, handle);
      setState(sessionId, 'connected');
      setFocus({ kind: 'session', sessionId });
      setCarriedOn((current) => {
        const next = new Map(current);
        /* The bastion's id comes from the saved record and the fact that there
           is one at all comes from the core. Pairing them is what stops the
           sidebar claiming a chain the connection never made. Through the ref
           because a connect runs for as long as the network takes, and the
           list this closure captured may be several reloads old by now. */
        const bastionId = savedRef.current.find((one) => one.id === sessionId)?.proxyJump;
        if (via === null || bastionId === null || bastionId === undefined) next.delete(sessionId);
        else next.set(sessionId, { bastionId, name: via });
        return next;
      });
    },
    /* A changed key, a host that did not answer, and a credential window the
       user closed are three different things, and the marker says which. */
    onFailed: (sessionId, code) => setState(sessionId, stateAfterFailure(code)),
    /* Back to a plain stored host. Nothing was learned about it — the attempt
       was let go, not answered — so anything else would be a claim. */
    onAbandoned: (sessionId) => setState(sessionId, 'saved'),
    onCredentialRefused: (sessionId, via) =>
      setUnsaved((current) => new Map(current).set(sessionId, via)),
    /* The connection is already closed by the time this runs. The host goes
       back to being a plain saved host, and the list is reloaded because what
       may have changed is on disk: the session now carries a credential id, or
       does not, and that is what the editor reads. */
    onCredentialSettled: (sessionId) => {
      setState(sessionId, 'saved');
      reload();
    },
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
  /* Everything on the strip goes in a group, not only the sessions: a host
     form and the settings page are tabs like any other, so a question about
     one host can sit in one rectangle while the terminals around it stay
     readable. That is ADR-0020 rule 3, and `Focus` already said it. */
  const groups = useMemo(
    () => resolveGroups(layout, held, entries, resolvedFocus),
    [layout, held, entries, resolvedFocus],
  );
  const focusedGroup = groupOf(groups, resolvedFocus);
  const filled = groups.filter((group) => group.entries.length > 0).length;
  const receiving = useMemo(() => receivingSessions(groups, muted), [groups, muted]);
  /* One pane left receiving is not a broadcast: it sends exactly where an
     unarmed keystroke goes, and the screen must not claim otherwise. */
  const armed = sync && receiving.length > 1;
  /* What the sidebar draws. Two sets rather than one, because "not receiving"
     and "not connected" are different answers and a host list that gave them
     the same marker would be answering neither. */
  const reaching = useMemo(
    () => (armed ? new Set(receiving) : null),
    [armed, receiving],
  );
  const spared = useMemo(
    () =>
      armed
        ? new Set(
            sparedSessions(
              sessions.filter((live) => live.handle !== null).map((live) => live.session.id),
              receiving,
            ),
          )
        : new Set<string>(),
    [armed, receiving, sessions],
  );

  /* The only thing in the window that says a broadcast was armed or disarmed
     without being looked at. Held here rather than derived in the bar because
     an announcement is about the change, and the bar only ever sees the state
     it is in now. See #154. */
  const hostsReceiving = armed ? receiving.length : null;
  const lastReceiving = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  useEffect(() => {
    const said = announceBroadcast(lastReceiving.current, hostsReceiving);
    lastReceiving.current = hostsReceiving;
    if (said !== null) setAnnouncement(said);
  }, [hostsReceiving]);

  /* Nobody inherits a broadcast they did not arm. Moving the focus within a
     group leaves this alone; changing which hosts are showing does not, and
     with groups that includes flipping to another tab of the same group. */
  const paneKey = groups.map((group) => shownSession(group) ?? '').join('\u0000');
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
      if (next !== null) {
        setHeld((current) => placeEntry(current, focusedGroup < 0 ? 0 : focusedGroup, next));
      }

      const sessionId = focusedSession(next);
      if (sessionId !== null) {
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
    [focusedGroup],
  );

  /* Where a keystroke goes, resolved for the terminal that produced it. */
  const broadcast = useCallback(
    (from: string, bytes: Uint8Array): void => {
      for (const sessionId of inputTargets(groups, from, sync, muted)) {
        const target = mounted.find((candidate) => candidate.sessionId === sessionId);
        if (target === undefined) continue;
        /* Rejections are caught and dropped on purpose. The input is split to
           stay inside what the core accepts, so what is left is a session that
           has ended, and `onClosed` already says so. A banner per keystroke
           after that would bury it. */
        void sendInput(target.handle, bytes).catch(() => {});
      }
    },
    [groups, sync, muted, mounted],
  );

  /* Which rectangle a session's surfaces belong in, or `null` when it is not
     on screen at all. ADR-0015 put a session's surfaces in that session's
     panel; ADR-0020 reads that as the group whose active tab it is, so a
     session sitting behind another has no box and its questions wait until it
     is showing. */
  const boxOf = useCallback(
    (entry: Focus): Box | null => {
      const group = groups.find((candidate) => sameFocus(activeEntry(candidate), entry));
      return group?.box ?? null;
    },
    [groups],
  );

  /* Changing the shape resizes the groups with it, and disarms the switch: the
     set of hosts receiving what you type has just changed. Entries in a group
     the new shape does not have are not dropped; `resolveGroups` finds them a
     home rather than leaving a session running with no rectangle. */
  const chooseLayout = useCallback((kind: Grid): void => {
    setHeld((current) =>
      Array.from(
        { length: gridCount(kind) },
        (_, at) => current[at] ?? { entries: [], activeAt: -1 },
      ),
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

  /* Taking a tab off the strip also takes it out of the group that held it.
     Without this the group remembers a tab nobody can see, and reopening the
     same host form puts it back in a rectangle nobody chose rather than in the
     one being worked in. */
  const forget = useCallback(
    (target: Focus): void => {
      setHeld((current) => removeEntry(current, target));
      setFocus(focusAfterClosing(entries, target));
    },
    [entries],
  );

  /* Closing any tab, whichever kind it is. One handler because the strip is
     one ring: a group should not have to know that a session disconnects, an
     editor may have unsaved work, and settings just goes away. */
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

        forget(target);
        setEditors((current) => withoutEditor(current, target.target));
        return;
      }

      forget(target);

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
    [forget, attentionId, abandon, disconnect],
  );

  /* Sending a tab to another rectangle by name.
     Not `focusOn`, which asks `placeEntry`, which deliberately refuses to move
     anything a group already holds. This is the case that rule was protecting
     against guessing at, so it says so out loud. */
  const moveTo = useCallback((entry: Focus, group: number): void => {
    setHeld((current) => moveEntry(current, entry, group));
    setFocus(entry);

    const sessionId = focusedSession(entry);
    if (sessionId !== null) setSelected(sessionId);
  }, []);

  /* Closing every tab in one group.
     Not a loop over `closeFocus`. That one reads `entries` from this render to
     decide what takes the focus next, so four calls in a row would each answer
     from the same stale list and the last one would win, possibly landing the
     focus on a tab it had just closed.

     Unsaved work is never thrown out in bulk either. A form holding changes
     stays where it is and asks, and everything else closes around it. */
  const closeGroup = useCallback(
    (at: number): void => {
      const group = groups[at];
      if (group === undefined) return;

      const asking = group.entries.filter((entry) => {
        if (entry.kind !== 'editor') return false;
        const open = findEditor(editorsRef.current, entry.target);
        return open !== null && editorDirty(open);
      });
      const going = group.entries.filter(
        (entry) => !asking.some((held_) => sameFocus(held_, entry)),
      );

      for (const entry of asking) {
        if (entry.kind !== 'editor') continue;
        setEditors((current) =>
          updateEditor(current, entry.target, (editor) => ({ ...editor, discarding: true })),
        );
      }

      setHeld((current) => going.reduce((acc, entry) => removeEntry(acc, entry), current));

      /* The question, if one is being asked, so it is on screen when it is
         asked. Otherwise whatever is left anywhere. */
      const survivors = entries.filter(
        (entry) => !going.some((held_) => sameFocus(held_, entry)),
      );
      setFocus(asking[0] ?? survivors[0] ?? null);

      for (const entry of going) {
        if (entry.kind === 'settings') {
          setSettingsOpen(false);
          continue;
        }

        if (entry.kind === 'editor') {
          setEditors((current) => withoutEditor(current, entry.target));
          continue;
        }

        if (attentionId === entry.sessionId) abandon();
        disconnect(entry.sessionId);
      }
    },
    [groups, entries, attentionId, abandon, disconnect],
  );

  /* Putting a saved host in a particular rectangle.
     What the `+` on a group's strip is for. The first version of it opened the
     host form, which is what somebody wants perhaps once; what they want in
     front of an empty rectangle is one of the hosts they already have.

     The group is claimed before the connection exists. `held` is a hint and
     `resolveGroups` simply does not draw an entry that is not open yet, so the
     session appears here rather than wherever the focus happened to be when
     the host finally answered. */
  const openHere = useCallback(
    (sessionId: string, group: number): void => {
      const live = sessions.find((entry) => entry.session.id === sessionId);
      if (live === undefined) return;

      const mine: Focus = { kind: 'session', sessionId };
      setHeld((current) => moveEntry(current, mine, group));
      setSelected(sessionId);
      setFocus(mine);

      /* Already open, or already on its way. Both only move; a second connect
         to the same host is two sockets with the first orphaned. */
      if (live.handle !== null) return;
      if (attempt !== null && attempt.sessionId === sessionId && isInProgress(attempt.stage)) {
        return;
      }

      void connect(sessionId);
    },
    [sessions, attempt, connect],
  );

  /* The gear on the rail, and the palette. Both land here so the tab is opened
     and placed in one move; ADR-0020 keeps it an action rather than a view, so
     it takes no marker on the rail and leaves the sidebar alone. */
  const openSettings = useCallback((): void => {
    setSettingsOpen(true);
    focusOn({ kind: 'settings' });
  }, [focusOn]);

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
      : { session: failedSession, code: attempt.stage.code, hop: attempt.stage.hop };

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

      void connect(sessionId);
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
            hop={decision.hop}
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
            hop={decision.hop}
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
          hop={decision.hop}
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

    if (attempt.stage.stage === 'settled') {
      const live = sessions.find((entry) => entry.session.id === attempt.sessionId);
      if (live === undefined) return null;

      return (
        <CredentialSaved
          session={live.session}
          keeping={attempt.stage.keeping}
          stored={hasStoredCredential(live.session)}
          onDismiss={abandon}
        />
      );
    }

    if (failed !== null) {
      return (
        <ConnectionFailure
          session={failed.session}
          code={failed.code}
          hop={failed.hop}
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

  /* Reloaded whichever way it goes, because the editor renders the fact rather
     than an outcome: a keychain that refused still holds the entry, and the
     block goes on saying so, which is true. What is missing is the sentence
     saying the click failed, and the editor has nowhere to put one. That is
     its own gap and its own issue, not something to invent a channel for
     here. */
  const forgetPassword = useCallback(
    (sessionId: string): void => {
      void forgetCredential(sessionId)
        .catch(() => undefined)
        .then(() => reload());
    },
    [reload],
  );

  const saved = useMemo(() => sessions.map((live) => live.session), [sessions]);
  /* What the sidebar draws, which is not quite what is open. A bastion with no
     tab of its own still has a live authenticated connection to it while a
     session behind it is running, and the row has to say so. #168. */
  const shown = useMemo(() => markCarried(sessions, carriedOn), [sessions, carriedOn]);
  /* The host the focused session travels through, or `null`. Read only while
     it is actually open: the entry outlives the connection by design, and a
     bar still naming a hop after the session closed would be the same lie in
     the other direction. */
  const activeCarrier = useMemo(() => {
    if (activeId === null || activeHandle === null) return null;
    const carried = carriedOn.get(activeId);
    return carried === undefined ? null : carrierName(saved, carried);
  }, [activeId, activeHandle, carriedOn, saved]);

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
    /* `after` runs on what was stored, before the tab is decided about. It is
       how "connect once and save" reaches a host that did not exist a moment
       ago: the id it needs is the one the core has just assigned. */
    (target: EditorTarget, after?: (stored: Session) => void): void => {
      const open = findEditor(editorsRef.current, target);
      if (open === null) return;

      /* Named after the host if it was left blank, which is what somebody
         would type if the form insisted. */
      const filled = suggestName(open.values);
      const problems = invalidFields(filled);

      /* The one field the core refuses that the form cannot check on its own,
         and the one state it cannot prevent: a host saved before this rule
         existed, already carrying other sessions and already holding a jump
         host of its own. The save would be refused, so it is stopped here with
         the field named rather than sent to be turned down in silence. */
      const carried =
        target.kind === 'existing'
          ? jumpHostChoice(saved, target.sessionId, filled.proxyJump).carried
          : [];
      const wrong: readonly DraftField[] =
        carried.length > 0 && filled.proxyJump !== '' ? [...problems, 'proxyJump'] : problems;

      if (wrong.length > 0) {
        setEditors((current) =>
          updateEditor(current, target, (editor) => ({ ...editor, values: filled, wrong })),
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
        proxyJump: filled.proxyJump === '' ? null : filled.proxyJump,
      }).then((stored) => {
        after?.(stored);

        /* Saving a host that did not exist closes the tab it was created on.
           The alternative is a tab that goes on saying "New session" while
           holding one already on disk — the tab lying about its own contents —
           and what somebody wants next is almost always to connect to it.
           Editing a host that already existed leaves the tab open, because
           there the name on it stays true. */
        if (target.kind === 'new') {
          forget({ kind: 'editor', target });
          setEditors((current) => withoutEditor(current, target));
          return;
        }

        setEditors((current) => updateEditor(current, target, () => settled(stored)));
      });
    },
    [saved, save, forget],
  );

  /* Save, then collect a password on the connection that proves it works.
     `connect` with this intent closes the connection as soon as the server has
     accepted, so nothing is left open and no terminal is opened for a host
     nobody asked to work on. */
  const savePasswordIn = useCallback(
    (target: EditorTarget): void => {
      submitIn(target, (stored) => {
        /* Taken to the attempt, not left on the form. Everything this does
           happens in the session's own panel, starting with a host key
           decision, and driving it showed the whole sequence running in a tab
           nobody was looking at: the button appeared to do nothing, and the
           one screen that must never be answered without being read was the
           screen behind the one on top. */
        setFocus({ kind: 'session', sessionId: stored.id });
        void connect(stored.id, 'credential');
      });
    },
    [submitIn, connect],
  );

  const removeIn = useCallback(
    (target: EditorTarget): void => {
      if (target.kind === 'new') return;

      remove(target.sessionId);
      forget({ kind: 'editor', target });
      setEditors((current) => withoutEditor(current, target));
    },
    [remove, forget],
  );

  const discardIn = useCallback(
    (target: EditorTarget, confirmed: boolean): void => {
      if (!confirmed) {
        setEditors((current) =>
          updateEditor(current, target, (editor) => ({ ...editor, discarding: false })),
        );
        return;
      }

      forget({ kind: 'editor', target });
      setEditors((current) => withoutEditor(current, target));
    },
    [forget],
  );

  /* Opening the form is what puts its tab in a group: the sidebar's `+` and
     the row menu's Edit both land here rather than each knowing about tabs.
     Through `focusOn`, so the form appears in the rectangle being worked in
     and not in whichever one the resolver would have picked. */
  const openEditor = useCallback(
    (target: EditorTarget): void => {
      setEditors((current) => withEditor(current, target, savedRef.current));
      focusOn({ kind: 'editor', target });
    },
    [focusOn],
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
      groupCount: groups.length,
      focusedGroup,
      focusedTitle:
        resolvedFocus === null ? null : entryTitle(resolvedFocus, tabs, editorTabs, i18n),
      actions: {
        newSession: () => openEditor({ kind: 'new' }),
        editSession: (sessionId: string) => openEditor({ kind: 'existing', sessionId }),
        selectSession: activate,
        activateTab: (sessionId: string) => focusOn({ kind: 'session', sessionId }),
        closeTab: (sessionId: string) => closeFocus({ kind: 'session', sessionId }),
        moveTab: (step) => focusOn(focusAfter(entries, resolvedFocus, step)),
        splitPanel: chooseLayout,
        moveTabToGroup: (at: number) => {
          if (resolvedFocus !== null) moveTo(resolvedFocus, at);
        },
        closeGroup: () => closeGroup(focusedGroup),
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
    [i18n, sessions, tabs, activeId, chosen, maximized, nativeDecorations, act, choose, closeFocus, activate, useNativeDecorations, openSettings, settingsOpen, resolvedFocus, focusOn, entries, chooseLayout, layout, sync, filled, muted, armed, receiving, groups, focusedGroup, editorTabs, moveTo, closeGroup],
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
    () => new Map(sessions.map((live) => [live.session.id, groupLabel(live.session)])),
    [sessions],
  );

  /* What a group's menu offers, built where the state is rather than inside
     the menu, which is handed a list and knows nothing about groups. */
  const groupMenuItems = useMemo<readonly GroupMenuItem[]>(() => {
    if (groupMenu === null) return [];

    const group = groups[groupMenu.group];
    if (group === undefined) return [];

    const items: GroupMenuItem[] = [];
    const { entry } = groupMenu;

    if (entry !== null) {
      for (let to = 0; to < groups.length; to += 1) {
        if (to === groupMenu.group) continue;
        items.push({
          id: `move:${String(to)}`,
          label: i18n.t('group.move', {
            name: entryTitle(entry, tabs, editorTabs, i18n),
            number: String(to + 1),
          }),
          run: () => {
            moveTo(entry, to);
            setGroupMenu(null);
          },
        });
      }
    }

    /* How many connections this is about to drop, on the control that drops
       them. The same shape the broadcast switch uses in the palette: the count
       belongs where it is read a moment before the decision, not in a dialog
       afterwards. */
    const live = group.entries.filter(
      (candidate) =>
        candidate.kind === 'session' &&
        tabs.some((tab) => tab.sessionId === candidate.sessionId && tab.handle !== null),
    ).length;

    items.push({
      id: 'close',
      label: i18n.t('group.close'),
      ...(live === 0
        ? {}
        : {
            detail:
              i18n.plural(live) === 'one'
                ? i18n.t('group.close.detail.one')
                : i18n.t('group.close.detail.other', { count: String(live) }),
          }),
      destructive: true,
      run: () => {
        closeGroup(groupMenu.group);
        setGroupMenu(null);
      },
    });

    return items;
  }, [groupMenu, groups, tabs, editorTabs, i18n, moveTo, closeGroup]);

  /* What the status bar says it is describing. Same source as the tabs, so
     the bar and a strip cannot disagree about a session's name. */
  const activeIdentity = activeId === null ? null : (paneLabels.get(activeId) ?? null);

  /* Where a drag lands. A tab moves, a host from the list opens: `openHere`
     already knows that one of those is a connection it has to make and the
     other is one it must not make twice. */
  const dropInto = useCallback(
    (dragged: Dragged, group: number): void => {
      if (dragged.kind === 'tab') moveTo(dragged.entry, group);
      else openHere(dragged.sessionId, group);

      setDragging(null);
      setDropOver(null);
    },
    [moveTo, openHere],
  );

  const pasteBox =
    pendingPaste === null ? null : boxOf({ kind: 'session', sessionId: pendingPaste.sessionId });
  const attemptBox =
    attempt === null ? null : boxOf({ kind: 'session', sessionId: attempt.sessionId });

  return (
    <div className="flex h-full flex-col">
      <Titlebar
        /* Until the core answers, the bar draws without controls. It is the
           same height either way, so nothing below it moves. */
        controls={chrome === null ? [] : windowControls(chrome, maximized)}
        leadingInset={chrome?.leadingInset ?? 0}
        layout={layout}
        onLayout={chooseLayout}
        onAct={act}
      />

      <div className="flex min-h-0 flex-1">
        <ActivityRail
          sidebarOpen={sidebarOpen}
          armed={armed}
          openCount={tabs.length}
          settingsOpen={settingsOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onOpenSettings={openSettings}
        />

        {sidebarOpen && (
          <SessionsSidebar
            sessions={shown}
            selectedId={selected}
            receiving={reaching}
            spared={spared}
            onDrag={(sessionId) => {
              setDragging(sessionId === null ? null : { kind: 'host', sessionId });
              if (sessionId === null) setDropOver(null);
            }}
            onSelect={activate}
            onAdd={() => openEditor({ kind: 'new' })}
            onMenu={(sessionId, at) => setMenu({ sessionId, at })}
          />
        )}

        {/* `relative` is what every group and every surface is positioned
            against. Surfaces are stacked rather than swapped: one per session
            and one per open form, only the ones a group is showing visible, so
            switching tabs neither destroys an xterm nor loses a half-typed
            host. ADR-0014. */}
        <main
          /* `overflow-hidden` is not tidying. xterm sizes its screen to a whole
             number of rows, and the remainder — up to one cell height — is
             painted past the bottom of this box and over the status bar, which
             is where the bar appeared to be cut off. Clipping here bounds the
             terminal to its group whatever the fit arithmetic rounds to. */
          className="bg-surface-base relative min-w-0 flex-1 overflow-hidden"
        >
          {/* A strip names the tabs a rectangle holds, so one holding none
              draws none. It carried a `+` for a while, which was the only
              thing an empty group could offer; a host is dragged straight into
              it now, and a bar with nothing in it is 28px of chrome saying
              nothing. */}
          {groups.map((group, at) => {
            const shown = shownSession(group);
            const syncing = armed && shown !== null && !muted.has(shown);
            const empty = group.entries.length === 0;

            return (
              <div
                key={`group-${String(at)}`}
                className={`absolute flex flex-col overflow-hidden ${
                  !empty
                    ? `bg-surface-terminal ${EDGES[groupEdge(layout, at === focusedGroup, syncing)]}`
                    : layout === '1x1'
                      ? /* The whole area, with nothing open in it. The panel
                           below says so in words; a dashed line around the
                           entire window would be saying it twice, and on the
                           first screen anybody meets. */
                        EDGES.none
                      : /* One rectangle of a split. Dashed rather than solid
                           so it reads as somewhere to put a session and not as
                           a terminal that failed to paint, which is the worry
                           the empty panel was written for. */
                        'border-line-subtle border-2 border-dashed'
                }`}
                style={frameStyle(group.box)}
                onDragOver={dragging === null ? undefined : (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropOver(at);
                }}
                onDrop={dragging === null ? undefined : (event) => {
                  event.preventDefault();
                  dropInto(dragging, at);
                }}
              >
                {!empty && (
                <GroupStrip
                  entries={group.entries}
                  active={activeEntry(group)}
                  focus={resolvedFocus}
                  tabs={tabs}
                  editorTabs={editorTabs}
                  labels={paneLabels}
                  dense={layout !== '1x1'}
                  label={
                    layout === '1x1'
                      ? i18n.t('tabs.label')
                      : i18n.t('group.tabs', { number: String(at + 1) })
                  }
                  /* Refusing on an undivided window and on one where arming
                     would reach nowhere: a broadcast to a single rectangle
                     sends exactly where an ordinary keystroke goes. */
                  sync={
                    layout === '1x1' || filled < 2
                      ? 'unavailable'
                      : sync && shown !== null && !muted.has(shown)
                        ? 'on'
                        : 'off'
                  }
                  onToggleSync={() => {
                    /* The first press arms, and arming has always started with
                       every rectangle receiving. Pressing one while armed
                       takes that rectangle out, or puts it back. */
                    if (!sync) {
                      setMuted(new Set());
                      setSync(true);
                      return;
                    }

                    if (shown === null) return;

                    setMuted((current) => {
                      const next = new Set(current);
                      if (next.has(shown)) next.delete(shown);
                      else next.add(shown);
                      return next;
                    });
                  }}
                  onFocus={focusOn}
                  /* One handler for every strip. Closing an editor goes through
                     the hook, because that is one of the ways unsaved work gets
                     thrown out. */
                  onClose={closeFocus}
                  onMenu={(entry, point) =>
                    setGroupMenu({ group: at, entry, at: point })
                  }
                  onDrag={(entry) => {
                    setDragging(entry === null ? null : { kind: 'tab', entry });
                    if (entry === null) setDropOver(null);
                  }}
                />
                )}

                {/* The body is drawn by the surfaces below, which are siblings
                    of this frame rather than children of it: a terminal that
                    changed parent on the way between groups would be
                    remounted, which is what ADR-0014 exists to prevent. The
                    exception is a rectangle with nothing in it, which has no
                    surface to draw and says so here. */}
                <div className="min-h-0 flex-1">
                  {empty && (
                    <EmptyPanel
                      modifier={chrome?.commandModifier ?? 'control'}
                      variant={layout === '1x1' && entries.length === 0 ? 'panel' : 'group'}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {mounted.map((terminal) => {
            const mine: Focus = { kind: 'session', sessionId: terminal.sessionId };
            /* Showing means being the active tab of a group. A session in a
               group's background is mounted and hidden exactly the way an
               inactive tab has always been. */
            const box = boxOf(mine);
            const isFocused = terminal.sessionId === activeId;

            return (
              <TerminalView
                key={terminal.sessionId}
                handle={terminal.handle}
                visible={box !== null}
                focused={isFocused}
                /* Off screen it keeps the whole area, so `FitAddon` and the
                   resize observer go on measuring something real. ADR-0014. */
                frame={bodyStyle(box ?? WHOLE_AREA)}
                id={panelElementId(mine)}
                labelledBy={tabElementId(mine)}
                onPaneFocus={() => focusOn(mine)}
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

          {editors.map((open) => {
            const mine: Focus = { kind: 'editor', target: open.target };
            const box = boxOf(mine);
            const editingId = open.target.kind === 'existing' ? open.target.sessionId : null;
            const jump = jumpHostChoice(saved, editingId, open.values.proxyJump);

            return (
              /* One panel per open form, all mounted, only the ones a group is
                 showing visible, the same trick the terminals use. A
                 half-typed host survives a glance at a session and is still
                 there on the way back, and now so does the *other* half-typed
                 host. */
              <div
                key={editorKey(open.target)}
                id={panelElementId(mine)}
                role="tabpanel"
                aria-labelledby={tabElementId(mine)}
                className={`absolute overflow-y-auto ${
                  box === null ? 'invisible pointer-events-none' : ''
                }`}
                style={bodyStyle(box ?? WHOLE_AREA)}
                aria-hidden={box === null ? true : undefined}
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
                  jumpHosts={jump.offered}
                  carried={jump.carried}
                  storedCredential={(() => {
                    const session = targetSession(open.target, saved);
                    return session !== null && hasStoredCredential(session);
                  })()}
                  onForget={editingId === null ? null : () => forgetPassword(editingId)}
                  onChange={(field, value) => changeIn(open.target, field, value)}
                  onSubmit={() => submitIn(open.target)}
                  onSavePassword={() => savePasswordIn(open.target)}
                  onDelete={() => removeIn(open.target)}
                  onConfirmDiscard={() => discardIn(open.target, true)}
                  onCancelDiscard={() => discardIn(open.target, false)}
                />
              </div>
            );
          })}

          {settingsOpen &&
            (() => {
              const mine: Focus = { kind: 'settings' };
              const box = boxOf(mine);

              return (
                /* Mounted for as long as the tab is on a strip, and hidden the
                   same way the terminals are, so the section you were reading
                   is still the section you come back to. */
                <div
                  id={panelElementId(mine)}
                  role="tabpanel"
                  aria-labelledby={tabElementId(mine)}
                  className={`absolute overflow-y-auto ${
                    box === null ? 'invisible pointer-events-none' : ''
                  }`}
                  style={bodyStyle(box ?? WHOLE_AREA)}
                  aria-hidden={box === null ? true : undefined}
                >
                  <SettingsPanel
                    chosenLocale={chosen}
                    onChooseLocale={(locale) => void choose(locale)}
                    nativeDecorations={nativeDecorations}
                    theme={theme}
                    onChooseTheme={(next) => void chooseTheme(next)}
                    onUseNativeDecorations={useNativeDecorations}
                  />
                </div>
              );
            })()}

          {/* A paste waiting on an answer, in the group of the session that
              asked. Ahead of the attempt surface in document order because a
              session with a terminal to paste into is not one that has an
              attempt still running. */}
          {pendingPaste !== null && pasteBox !== null && (
            <div className="absolute" style={bodyStyle(pasteBox)}>
              <PasteConfirm
                text={pendingPaste.text}
                hosts={inputTargets(groups, pendingPaste.sessionId, sync, muted).length}
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

          {/* Where a dragged tab can be let go.
              One per rectangle, and only while something is being dragged.
              They have to exist as their own elements because a group's body
              is covered by a terminal, which is a sibling of the frame rather
              than a child of it (ADR-0014), and xterm has its own opinions
              about the pointer. Last in document order so they are above
              everything they cover. */}
          {dragging !== null &&
            groups.map((group, at) => (
              <div
                key={`drop-${String(at)}`}
                /* The whole rectangle when it is empty, because there is no
                   strip above it to leave room for. */
                style={group.entries.length === 0 ? frameStyle(group.box) : bodyStyle(group.box)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropOver(at);
                }}
                onDragLeave={() => setDropOver((current) => (current === at ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  dropInto(dragging, at);
                }}
                className={`absolute z-20 rounded-sm border-2 border-dashed transition-colors ${
                  dropOver === at
                    ? 'border-accent bg-accent-soft/70'
                    : 'border-line-strong bg-surface-base/25'
                }`}
              />
            ))}

          {/* Everything an attempt has to say, inside the group of the session
              it names. ADR-0015, read as ADR-0020 reads it: the group whose
              active tab that session is. Positioned and last in document order
              so it paints over that session's terminal, and bounded to that
              group, so a question about one session cannot cover another.
              Absent entirely when its session is showing nowhere: there is no
              honest place to draw it, and the tab is still on a strip. */}
          {attempt !== null && attemptSurface !== null && attemptBox !== null && (
            <div className="absolute" style={bodyStyle(attemptBox)}>
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
        identity={activeIdentity}
        stats={stats}
        size={size}
        modifier={chrome?.commandModifier ?? 'control'}
        syncing={hostsReceiving}
        via={activeCarrier}
        announcement={announcement}
        credentialUnsaved={
          activeId !== null && unsaved.has(activeId)
            ? { via: unsaved.get(activeId) ?? null }
            : null
        }
        onDismissUnsaved={() =>
          setUnsaved((current) => {
            if (activeId === null) return current;
            const next = new Map(current);
            next.delete(activeId);
            return next;
          })
        }
      />

      {groupMenu !== null && (
        <GroupMenu
          items={groupMenuItems}
          at={groupMenu.at}
          label={
            groupMenu.entry === null
              ? i18n.t('group.tabs', { number: String(groupMenu.group + 1) })
              : entryTitle(groupMenu.entry, tabs, editorTabs, i18n)
          }
          onDismiss={() => setGroupMenu(null)}
        />
      )}

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
