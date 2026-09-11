import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import type { Component, ComponentKind, Link, Point, Session, SessionHandle, Size, Vision, Workspace } from '../../ipc';
import { isCursorPositionReport } from '../../features/terminal/clipboard';
import type { MountedTerminal } from '../../features/terminal';
import type { ClipboardApi } from '../../features/terminal/use-terminal';
import {
  addComponent,
  addLink,
  addLocal,
  addMember,
  addVision,
  canLink,
  changeHost,
  componentsOn,
  defaultSize,
  destinationsOf,
  edgePoint,
  familyOf,
  lineKey,
  linkedSet,
  linkedSets,
  localOn,
  mapInputTargets,
  mapReceiving,
  outsideLink,
  moveVision,
  removeComponent,
  removeLink,
  removeMember,
  removeVision,
  renameVision,
  resetPosition,
  setKey,
  switchState,
  terminalBox,
  terminalMenu,
  terminalTreatment,
  toStage,
  visibleMidpoint,
  visionsOn,
  REGION,
} from '../../features/map';
import type { AddRefusal, HostAsk, SwitchState } from '../../features/map';
import { HUB, useMapStage } from '../../features/map/use-map-stage';
import { useTranslator } from '../../features/settings';
import type { Endpoint, PaneEntry } from '../../features/sftp/endpoint';
import type { MapDestination, PaneReport } from '../../features/sftp/use-fanout';

import { AlertDialog } from '../ui/Dialog';

import { ComponentNode } from './ComponentNode';
import { LineHandle, LineKnot } from './LineHandle';
import { MapTerminals } from './MapTerminals';
import type { TerminalWiring } from './MapTerminals';
import { ComponentWindow } from './ComponentWindow';
import { HostPicker } from './HostPicker';
import { HostPopup } from './HostPopup';
import { MapMenu } from './MapMenu';
import type { MapMenuItem } from './MapMenu';
import { NameDialog } from './NameDialog';
import { Radial } from './Radial';
import type { RadialOption } from './Radial';
import { VisionNode } from './VisionNode';
import { VisionRegion } from './VisionRegion';
import { KindGlyph, RuneGlyph, kindColor } from './glyphs';

/** The strip of a window, in stage pixels: what the body sits below. */
const STRIP = 28;

/** A closed component's box at 100%, for where a line meets its icon. */
const ICON_BOX: Size = { w: 96, h: 112 };
/** A closed vision's aperture, for where a line to a member behind it ends. */
const APERTURE_BOX: Size = { w: 96, h: 96 };

/** The menu target for a line, so one menu path serves nodes and lines. */
const LINE_TARGET = 'line:';
/** The menu target for the inside of a terminal window (#115). */
const TERMINAL_TARGET = 'terminal:';

/** Where a terminal is drawn, relative to the map's own main area. */
export interface TerminalFrame {
  readonly sessionId: string;
  readonly componentId: string;
  readonly handle: SessionHandle;
  readonly style: CSSProperties;
  /** The window body's element id, which the terminal is labelled by. */
  readonly bodyId: string;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly zIndex: number;
}

/** What the shell wires into a file browser the map mounts (ADR-0065). */
export interface MapPaneWiring {
  readonly paneId: string;
  readonly onClose: () => void;
  readonly onReport: (paneId: string, report: PaneReport | null) => void;
  readonly onSelectionChange: (entries: readonly PaneEntry[]) => void;
}

export interface HostPopupState {
  readonly title: string;
  readonly detail: string;
  readonly element: ReactNode;
  readonly onClose: () => void;
}

/**
 * What the map's own row of the shared toolbar shows (ADR-0069): the crumb
 * (`['Runic']` at the root, `['Runic', name]` a level in, a vision filling
 * the screen or, once layers exist, a layer entered), the search box, the
 * zoom reading and Recenter. One row for the whole workspace, not a second
 * bar under it, and not a bar of its own for filling the screen either;
 * the crumb's own last segment is where that state and the layer's would
 * both be said, with `onBack` beside it doing what Escape already does.
 */
export interface MapToolbarContent {
  readonly crumb: readonly string[];
  /** Absent at the root, where there is nowhere back to go. */
  readonly onBack?: () => void;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onQuerySubmit: () => void;
  readonly zoomPercent: number;
  readonly onRecenter: () => void;
}

interface MapStageProps {
  readonly workspace: Workspace;
  readonly onChange: (next: Workspace) => void;
  /** The host book. */
  readonly hosts: readonly Session[];
  /** Session id to handle, for every host with a live connection. */
  readonly handles: ReadonlyMap<string, SessionHandle>;
  readonly onConnect: (sessionId: string) => void;
  readonly onDisconnect: (sessionId: string) => void;
  /** The connecting, host key or failure surface for a host mid-attempt, or
      `null` when nothing is being asked about it. Drawn inside the window,
      which is what ADR-0015 means once a window is the session's surface. */
  readonly attemptSurface: (sessionId: string) => JSX.Element | null;
  /** Opens the host editor over the map for a host already in the book:
      the window's title and the context menu (#357). */
  readonly onEditHost: (sessionId: string) => void;
  /** Opens the host editor over the map for a host not in the book yet,
      with `name` typed in and `ask` saying where the saved host goes. */
  readonly onNewHost: (name: string, ask: HostAsk) => void;
  /** The editor over the map, framed by `HostPopup`, or nothing. */
  readonly hostPopup: HostPopupState | null;
  /** The terminals: which are mounted, and what the shell wires into each.
      Mounted here in one stable stack (ADR-0014) and aimed at the frames
      this stage computes. */
  readonly terminals: TerminalWiring & { readonly mounted: readonly MountedTerminal[] };
  /** A file browser for a component: a saved host's, or this machine's
      when `host` is `null` (ADR-0065). */
  readonly renderSftp: (component: Component, host: Session | null, handle: SessionHandle | null, pane: MapPaneWiring) => ReactNode;
  readonly renderMonitor: (session: Session, handle: SessionHandle) => ReactNode;
  /** Sends entries from one endpoint to each destination, tracked in the
      shell's transfers (ADR-0045's mechanics, ADR-0065's gesture). */
  readonly onSend: (source: Endpoint, entries: readonly PaneEntry[], destinations: readonly MapDestination[]) => void;
  /** How many windows a keystroke typed on the map reaches right now, or
      `null` with no line armed: the status bar's warning edge and its
      announcement (ADR-0019, ADR-0065). */
  readonly onReceivingChange: (count: number | null) => void;
  /** Reports the map's own row of the toolbar, so the shell can render it
      in the shared bar (ADR-0046, ADR-0069) instead of a second one here. */
  readonly onToolbarChange: (content: MapToolbarContent) => void;
}

interface PickerState {
  readonly kind: ComponentKind;
  /** The component being pointed elsewhere, or `null` when creating. */
  readonly changing: string | null;
  readonly refusal: AddRefusal | null;
}

/** The name being asked for: a new vision's, or a new name for one (ADR-0067). */
type NamingState = { readonly kind: 'new' } | { readonly kind: 'rename'; readonly id: string };

const CREATE_KINDS: readonly ComponentKind[] = ['ssh', 'sftp', 'monitor'];

/**
 * The Map workspace's body: the floor, the rune, the components around it,
 * and the windows over them.
 *
 * Two layers, on purpose. The world (floor, wires, icons) is one element
 * with a CSS transform, so panning and zooming cost one style write. The
 * windows are drawn in stage pixels outside that transform, which is what
 * keeps a terminal 1:1 at any zoom (refit, `docs/measurements/terminal-under-zoom.md`)
 * and keeps `TerminalView` in one parent for the life of the session
 * (ADR-0014): the shell mounts terminals beside this stage and this stage
 * tells it where each one goes.
 */
export function MapStage({
  workspace,
  onChange,
  hosts,
  handles,
  onConnect,
  onDisconnect,
  attemptSurface,
  onEditHost,
  onNewHost,
  hostPopup,
  terminals,
  renderSftp,
  renderMonitor,
  onSend,
  onReceivingChange,
  onToolbarChange,
}: MapStageProps): JSX.Element {
  const i18n = useTranslator();
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [query, setQuery] = useState('');
  /* ADR-0065: the switch per connected set, keyed by the set's members, and
     the windows that spared themselves. In memory only, on purpose: a
     restart never comes up armed, and a set that changed is a new key. */
  const [armed, setArmed] = useState<ReadonlySet<string>>(new Set());
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [naming, setNaming] = useState<NamingState | null>(null);
  /* The hosts this map asked `connect` for and has not seen answer or let
     go of. A member a vision expanded without asking shows its saved state
     rather than "connecting", since nothing is (ADR-0067, ADR-0053). */
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());

  const level = useMemo(() => componentsOn(workspace, null), [workspace]);
  const levelVisions = useMemo(() => visionsOn(workspace, null), [workspace]);
  const byId = useMemo(() => new Map(hosts.map((host) => [host.id, host])), [hosts]);
  const componentById = useMemo(() => new Map(level.map((component) => [component.id, component])), [level]);
  const visionById = useMemo(() => new Map(levelVisions.map((vision) => [vision.id, vision])), [levelVisions]);
  const visionOfMember = useMemo(() => {
    const map = new Map<string, Vision>();
    for (const vision of levelVisions) for (const id of vision.components) map.set(id, vision);
    return map;
  }, [levelVisions]);
  /* A component's host, `null` for this machine, `undefined` for a remote
     kind whose host the book no longer has (the store drops it next load). */
  const hostOf = useCallback(
    (component: Component): Session | null | undefined =>
      component.host === undefined ? (component.kind === 'local' ? null : undefined) : byId.get(component.host),
    [byId],
  );
  const nameOf = useCallback(
    (id: string): string => {
      const vision = visionById.get(id);
      if (vision !== undefined) return vision.name;
      const component = componentById.get(id);
      if (component === undefined) return '';
      const host = hostOf(component);
      return host === null ? i18n.t('map.local.name') : (host?.name ?? '');
    },
    [componentById, hostOf, i18n, visionById],
  );

  const kindLabel = useCallback(
    (kind: ComponentKind): string =>
      i18n.t(
        kind === 'ssh'
          ? 'map.create.ssh'
          : kind === 'sftp'
            ? 'map.create.sftp'
            : kind === 'monitor'
              ? 'map.create.monitor'
              : 'map.create.local',
      ),
    [i18n],
  );

  /* What a hold or a right click offers, built where the state is. */
  const actionsFor = useCallback(
    (target: string | null): readonly (MapMenuItem & { readonly listOnly?: boolean })[] => {
      if (target === null || target === HUB) {
        const create: (MapMenuItem & { readonly listOnly?: boolean })[] = CREATE_KINDS.map((kind) => ({
          id: `create:${kind}`,
          label: kindLabel(kind),
          detail: i18n.t('map.create.detail'),
          color: kindColor(kind),
        }));
        /* One local machine per level (ADR-0065): offered until it is there. */
        if (localOn(workspace, null) === undefined) {
          create.push({
            id: 'create:local',
            label: kindLabel('local'),
            detail: i18n.t('map.create.local.detail'),
            color: kindColor('local'),
          });
        }
        create.push({ id: 'create:vision', label: i18n.t('map.create.vision'), detail: i18n.t('map.create.vision.detail'), color: 'var(--rs-accent)' });
        return create;
      }
      const vision = visionById.get(target);
      if (vision !== undefined) {
        /* ADR-0067. Connect all is the one action that starts sessions, and
           it is offered only while a member has none to start. */
        const items: (MapMenuItem & { readonly listOnly?: boolean })[] = [
          vision.open
            ? { id: 'closeVision', label: i18n.t('map.vision.close'), detail: i18n.t('map.vision.close.detail'), color: 'var(--rs-accent)' }
            : { id: 'openVision', label: i18n.t('map.vision.open'), detail: i18n.t('map.vision.open.detail'), color: 'var(--rs-accent)' },
          { id: 'fill', label: i18n.t('map.vision.fill'), detail: i18n.t('map.vision.fill.detail'), color: 'var(--rs-accent)' },
        ];
        const unconnected = vision.components.some((id) => {
          const member = componentById.get(id);
          return member?.host !== undefined && !handles.has(member.host);
        });
        if (unconnected) {
          items.push({ id: 'connectAll', label: i18n.t('map.vision.connectAll'), detail: i18n.t('map.vision.connectAll.detail'), color: 'var(--rs-ok)' });
        }
        items.push({ id: 'rename', label: i18n.t('map.vision.rename'), listOnly: true });
        items.push({ id: 'removeVision', label: i18n.t('map.vision.remove'), detail: i18n.t('map.vision.remove.detail'), danger: true });
        return items;
      }
      if (target.startsWith(LINE_TARGET)) {
        return [{ id: 'unlink', label: i18n.t('map.line.remove'), detail: i18n.t('map.line.remove.detail'), danger: true }];
      }
      if (target.startsWith(TERMINAL_TARGET)) {
        const id = target.slice(TERMINAL_TARGET.length);
        const component = componentById.get(id);
        if (component === undefined || component.host === undefined) return [];
        const clipboard = clipboards.current.get(component.host);
        const entries = terminalMenu({
          hasSelection: clipboard?.hasSelection() ?? false,
          reachable: level.some((other) => other.id !== id && canLink(workspace, id, other.id) === null),
          broadcast: broadcastRef.current(id),
        });
        /* The shortcut beside each entry is the point of the menu (#115): a
           person who opens it learns the key exists. On WebKitGTK the Paste
           entry is that signpost and no more; see
           `docs/measurements/terminal-menu-clipboard.md`. */
        const shortcut = (key: string): string =>
          i18n.t(terminals.modifier === 'meta' ? 'map.terminal.shortcut.meta' : 'map.terminal.shortcut.control', { key });
        const labels: Record<(typeof entries)[number]['id'], { readonly label: string; readonly detail?: string; readonly color?: string }> = {
          copy: { label: i18n.t('map.terminal.copy'), detail: shortcut('C') },
          paste: { label: i18n.t('map.terminal.paste'), detail: shortcut('V') },
          broadcast: { label: i18n.t('map.menu.broadcast'), detail: i18n.t('map.menu.broadcast.detail'), color: 'var(--rs-state-warn)' },
          mute: { label: i18n.t('map.terminal.mute') },
          unmute: { label: i18n.t('map.terminal.unmute') },
        };
        return entries.map((entry) => ({ id: entry.id, disabled: entry.disabled, ...labels[entry.id] }));
      }
      const component = componentById.get(target);
      if (component === undefined) return [];
      const items: (MapMenuItem & { readonly listOnly?: boolean })[] = [
        openRef.current.has(target)
          ? { id: 'collapse', label: i18n.t('map.menu.collapse'), detail: i18n.t('map.menu.collapse.detail'), color: kindColor(component.kind) }
          : { id: 'open', label: i18n.t('map.menu.open'), detail: kindLabel(component.kind), color: kindColor(component.kind) },
      ];
      /* A line needs another of its family to reach; with none, the option
         would be a gesture ending nowhere (ADR-0065). */
      const family = familyOf(component.kind);
      const reachable = level.some((other) => other.id !== target && canLink(workspace, target, other.id) === null);
      if (family === 'terminal' && reachable) {
        items.push({
          id: 'broadcast',
          label: i18n.t('map.menu.broadcast'),
          detail: i18n.t('map.menu.broadcast.detail'),
          color: 'var(--rs-state-warn)',
        });
      }
      if (family === 'files' && reachable) {
        items.push({
          id: 'transfer',
          label: i18n.t('map.menu.transfer'),
          detail: i18n.t('map.menu.transfer.detail'),
          color: 'var(--rs-state-warn)',
        });
      }
      if (component.host !== undefined) {
        items.push({ id: 'changeHost', label: i18n.t('map.menu.changeHost') }, { id: 'editHost', label: i18n.t('map.menu.editHost') });
        if (handles.has(component.host) || openRef.current.has(target)) {
          items.push({ id: 'close', label: i18n.t('map.menu.close'), detail: i18n.t('map.menu.close.detail'), listOnly: true });
        }
      }
      /* Membership (ADR-0067): a member's position is its pin, and "back
         to the grid" is what dropping it means there; a loose component is
         offered every vision on this level. */
      const member = visionOfMember.get(target);
      if (member !== undefined) {
        if (component.position !== undefined) items.push({ id: 'resetPosition', label: i18n.t('map.menu.backToGrid'), listOnly: true });
        items.push({ id: 'leaveVision', label: i18n.t('map.menu.leaveVision'), listOnly: true });
      } else {
        if (component.position !== undefined) items.push({ id: 'resetPosition', label: i18n.t('map.menu.resetPosition'), listOnly: true });
        for (const vision of levelVisions) {
          items.push({ id: `join:${vision.id}`, label: i18n.t('map.menu.putIn', { name: vision.name }), listOnly: true });
        }
      }
      if (component.size !== undefined) items.push({ id: 'defaultSize', label: i18n.t('map.menu.defaultSize'), listOnly: true });
      items.push({ id: 'remove', label: i18n.t('map.menu.remove'), detail: i18n.t('map.menu.remove.detail'), danger: true });
      return items;
    },
    [componentById, handles, i18n, kindLabel, level, levelVisions, terminals.modifier, visionById, visionOfMember, workspace],
  );

  /* The hook is declared below and its callbacks are read through these
     refs by the closures above it, so that the menu's actions and the
     hook can each mention the other without a cycle in declaration order,
     and without a stale set of open windows captured by a memoised callback. */
  const openRef = useRef<ReadonlySet<string>>(new Set());
  const collapseRef = useRef<(id: string) => void>(() => {});
  const openWindowRef = useRef<(id: string, reveal?: boolean) => void>(() => {});
  const focusRef = useRef<(id: string) => void>(() => {});
  const startLinkRef = useRef<(id: string) => void>(() => {});
  const broadcastRef = useRef<(id: string) => 'receiving' | 'muted' | 'armed' | null>(() => null);
  const toggleMuteRef = useRef<(id: string) => void>(() => {});
  const openVisionRef = useRef<(id: string) => void>(() => {});
  const closeVisionRef = useRef<(id: string) => void>(() => {});
  const enterFullscreenRef = useRef<(id: string) => void>(() => {});
  const positionsRef = useRef<ReadonlyMap<string, Point>>(new Map());
  /* Each mounted terminal's clipboard, by session (#115). */
  const clipboards = useRef(new Map<string, ClipboardApi>());
  const onClipboardHandle = useCallback((sessionId: string, clipboard: ClipboardApi): void => {
    clipboards.current.set(sessionId, clipboard);
  }, []);

  const closeComponent = useCallback(
    (component: Component): void => {
      collapseRef.current(component.id);
      if (component.host === undefined) return;
      const host = component.host;
      setAsked((current) => {
        if (!current.has(host)) return current;
        const next = new Set(current);
        next.delete(host);
        return next;
      });
      const othersOpen = level.some(
        (other) => other.id !== component.id && other.host === component.host && openRef.current.has(other.id),
      );
      if (!othersOpen && handles.has(component.host)) onDisconnect(component.host);
    },
    [handles, level, onDisconnect],
  );

  const act = useCallback(
    (target: string | null, action: string): void => {
      if (action === 'create:local') {
        const outcome = addLocal(workspace);
        if (outcome.ok) onChange(outcome.workspace);
        return;
      }
      if (action === 'create:vision') {
        setNaming({ kind: 'new' });
        return;
      }
      if (action.startsWith('create:')) {
        const kind = action.slice('create:'.length) as ComponentKind;
        setPicker({ kind, changing: null, refusal: null });
        return;
      }
      if (target === null) return;
      const vision = visionById.get(target);
      if (vision !== undefined) {
        switch (action) {
          case 'openVision':
            openVisionRef.current(vision.id);
            return;
          case 'closeVision':
            closeVisionRef.current(vision.id);
            return;
          case 'fill':
            enterFullscreenRef.current(vision.id);
            return;
          case 'connectAll': {
            /* The one action that starts sessions, and each one is asked
               for by name (ADR-0067): every member without a session, its
               window opened so the host key question has its surface. */
            const starting: string[] = [];
            for (const id of vision.components) {
              const member = componentById.get(id);
              if (member?.host === undefined || handles.has(member.host)) continue;
              openWindowRef.current(id, false);
              starting.push(member.host);
              onConnect(member.host);
            }
            setAsked((current) => new Set([...current, ...starting]));
            return;
          }
          case 'rename':
            setNaming({ kind: 'rename', id: vision.id });
            return;
          case 'removeVision': {
            /* Members flowing in the grid have no place of their own; they
               are left where they were drawn so they do not pile up. */
            const drops: Record<string, Point> = {};
            for (const id of vision.components) {
              const at = positionsRef.current.get(id);
              if (at !== undefined && componentById.get(id)?.position === undefined) drops[id] = { x: Math.round(at.x), y: Math.round(at.y) };
            }
            onChange(removeVision(workspace, vision.id, drops));
            return;
          }
        }
        return;
      }
      if (target.startsWith(TERMINAL_TARGET)) {
        const id = target.slice(TERMINAL_TARGET.length);
        const component = componentById.get(id);
        if (component === undefined || component.host === undefined) return;
        const clipboard = clipboards.current.get(component.host);
        switch (action) {
          case 'copy':
            clipboard?.copy();
            return;
          case 'paste':
            clipboard?.paste();
            return;
          case 'broadcast':
            startLinkRef.current(id);
            return;
          case 'mute':
          case 'unmute':
            toggleMuteRef.current(id);
            return;
        }
        return;
      }
      if (target.startsWith(LINE_TARGET)) {
        if (action !== 'unlink') return;
        const key = target.slice(LINE_TARGET.length);
        const directed = key.includes('>');
        const [a, b] = key.split(directed ? '>' : '~');
        if (a === undefined || b === undefined) return;
        onChange(
          directed
            ? { ...workspace, links: workspace.links.filter((link) => !(link.a === a && link.b === b)) }
            : removeLink(workspace, a, b),
        );
        return;
      }
      const component = componentById.get(target);
      if (component === undefined) return;
      if (action.startsWith('join:')) {
        const visionId = action.slice('join:'.length);
        const target = visionById.get(visionId);
        const anchor = positionsRef.current.get(visionId);
        if (target === undefined || anchor === undefined) return;
        const anchored = target.position === undefined ? moveVision(workspace, visionId, { x: Math.round(anchor.x), y: Math.round(anchor.y) }) : workspace;
        onChange(addMember(anchored, visionId, component.id));
        return;
      }
      switch (action) {
        case 'open': {
          openWindowRef.current(component.id);
          if (component.host === undefined || handles.has(component.host)) return;
          const host = component.host;
          setAsked((current) => new Set([...current, host]));
          onConnect(host);
          return;
        }
        case 'leaveVision': {
          const at = positionsRef.current.get(component.id);
          onChange(removeMember(workspace, component.id, at === undefined ? undefined : { x: Math.round(at.x), y: Math.round(at.y) }));
          return;
        }
        case 'broadcast':
        case 'transfer':
          startLinkRef.current(component.id);
          return;
        case 'collapse':
          collapseRef.current(component.id);
          return;
        case 'close':
          closeComponent(component);
          return;
        case 'changeHost':
          setPicker({ kind: component.kind, changing: component.id, refusal: null });
          return;
        case 'editHost':
          if (component.host !== undefined) onEditHost(component.host);
          return;
        case 'resetPosition':
          onChange(resetPosition(workspace, component.id));
          return;
        case 'defaultSize':
          onChange(defaultSize(workspace, component.id));
          return;
        case 'remove':
          closeComponent(component);
          onChange(removeComponent(workspace, component.id));
          return;
      }
    },
    [closeComponent, componentById, handles, onChange, onConnect, onEditHost, visionById, workspace],
  );

  /* A click while a line is being drawn is the line's other end, or the
     way out. Returns whether the click was that, so the caller leaves it
     alone; a click on a component that cannot be joined keeps the line
     in hand rather than dropping it, the way a picker keeps its question. */
  const linkingRef = useRef<{ readonly from: string } | null>(null);
  const cancelLinkRef = useRef<() => void>(() => {});
  const completeLink = useCallback(
    (id: string): boolean => {
      const linking = linkingRef.current;
      if (linking === null) return false;
      if (id === HUB || id === linking.from) {
        cancelLinkRef.current();
        return true;
      }
      const outcome = addLink(workspace, linking.from, id);
      if (outcome.ok) {
        onChange(outcome.workspace);
        cancelLinkRef.current();
      }
      return true;
    },
    [onChange, workspace],
  );

  const stage = useMapStage({
    workspace,
    components: level,
    visions: levelVisions,
    onChange,
    radialOptions: (id) => actionsFor(id).filter((item) => item.listOnly !== true).length,
    onClick: (id) => {
      if (completeLink(id)) return;
      if (id === HUB) return;
      const vision = visionById.get(id);
      if (vision !== undefined) {
        if (vision.open) focusRef.current(id);
        else openVisionRef.current(id);
        return;
      }
      const component = componentById.get(id);
      if (component === undefined) return;
      if (openRef.current.has(id)) {
        focusRef.current(id);
        return;
      }
      act(id, 'open');
    },
    onRadialPick: (id, segment) => {
      const option = actionsFor(id).filter((item) => item.listOnly !== true)[segment];
      if (option !== undefined) act(id === HUB ? null : id, option.id);
    },
  });

  openRef.current = stage.open;
  collapseRef.current = stage.collapse;
  openWindowRef.current = stage.openWindow;
  focusRef.current = stage.focus;
  openVisionRef.current = stage.openVision;
  closeVisionRef.current = stage.closeVision;
  enterFullscreenRef.current = stage.enterFullscreen;
  positionsRef.current = stage.positions;
  startLinkRef.current = stage.startLink;
  cancelLinkRef.current = stage.cancelLink;
  linkingRef.current = stage.linking;

  /* ADR-0065, ADR-0019's rules on a set of terminal lines. `stage.open` is
     the map's "showing": a collapsed window is spared the way a tab behind
     another is. Arming a set starts with every window in it included. */
  const receiving = useMemo(() => mapReceiving(workspace, armed, muted, stage.open), [workspace, armed, muted, stage.open]);
  const receivingSet = useMemo(() => new Set(receiving), [receiving]);
  useEffect(() => {
    onReceivingChange(receiving.length > 0 ? receiving.length : null);
  }, [onReceivingChange, receiving.length]);
  useEffect(() => {
    setAsked((current) => {
      const next = new Set([...current].filter((host) => !handles.has(host)));
      return next.size === current.size ? current : next;
    });
  }, [handles]);
  useEffect(() => () => onReceivingChange(null), [onReceivingChange]);

  const toggleArmed = useCallback(
    (members: readonly string[]): void => {
      const key = setKey(members);
      const live = new Set(linkedSets(workspace).map(setKey));
      setArmed((current) => {
        const next = new Set([...current].filter((one) => live.has(one)));
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (!armed.has(key)) setMuted((current) => new Set([...current].filter((id) => !members.includes(id))));
    },
    [armed, workspace],
  );
  const toggleMute = useCallback((id: string): void => {
    setMuted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const broadcastOf = useCallback(
    (id: string): 'receiving' | 'muted' | 'armed' | null => {
      const set = linkedSet(workspace, id);
      if (set.length < 2 || !armed.has(setKey(set))) return null;
      if (muted.has(id)) return 'muted';
      return receivingSet.has(id) ? 'receiving' : 'armed';
    },
    [armed, muted, receivingSet, workspace],
  );
  broadcastRef.current = broadcastOf;
  toggleMuteRef.current = toggleMute;

  /* The map's own routing: a keystroke typed in a map window reaches every
     receiving window on its set, and only those (ADR-0065 rule 4). The
     shell's wiring sends to one host; this fans it out. The cursor
     position report stays on the channel that asked, as it does in
     Sessions. */
  const routedTerminals = useMemo(
    () => ({
      ...terminals,
      onInput: (sessionId: string, bytes: Uint8Array): void => {
        const targets = isCursorPositionReport(new TextDecoder().decode(bytes))
          ? [sessionId]
          : mapInputTargets(workspace, sessionId, armed, muted, stage.open);
        for (const target of targets) terminals.onInput(target, bytes);
      },
    }),
    [armed, muted, stage.open, terminals, workspace],
  );

  const pick = useCallback(
    (sessionId: string): void => {
      if (picker === null) return;
      const outcome =
        picker.changing === null
          ? addComponent(workspace, picker.kind, sessionId, hosts)
          : changeHost(workspace, picker.changing, sessionId, hosts);
      if (!outcome.ok) {
        setPicker({ ...picker, refusal: outcome.refusal });
        return;
      }
      onChange(outcome.workspace);
      setPicker(null);
    },
    [hosts, onChange, picker, workspace],
  );

  const thumbnail = terminalTreatment(stage.view.scale) === 'thumbnail';
  const needle = query.trim().toLowerCase();
  const matches = useCallback(
    (component: Component): boolean => {
      if (needle === '') return true;
      const host = hostOf(component);
      if (host === null) return i18n.t('map.local.name').toLowerCase().includes(needle);
      if (host === undefined) return false;
      return `${host.name} ${host.host} ${host.user}`.toLowerCase().includes(needle);
    },
    [hostOf, i18n, needle],
  );

  const onQuerySubmit = useCallback((): void => {
    const first = level.find(matches);
    if (first !== undefined) act(first.id, stage.open.has(first.id) ? 'collapse' : 'open');
  }, [act, level, matches, stage.open]);

  /* The map's own row of the shared toolbar (ADR-0069): the crumb, search,
     zoom and Recenter, reported up rather than drawn in a second bar here.
     Memoised so a drag, which re-renders this component every pointer
     move without moving the view, does not hand the shell a new object
     every frame; only what the toolbar actually shows changes its
     identity. */
  const fullscreenVision = stage.fullscreen === null ? undefined : visionById.get(stage.fullscreen);
  const crumb = useMemo<readonly string[]>(
    () => (fullscreenVision === undefined ? [i18n.t('map.crumb.root')] : [i18n.t('map.crumb.root'), fullscreenVision.name]),
    [fullscreenVision, i18n],
  );
  const zoomPercent = Math.round(stage.view.scale * 100);
  const toolbarContent = useMemo<MapToolbarContent>(
    () => ({
      crumb,
      ...(fullscreenVision === undefined ? {} : { onBack: stage.exitFullscreen }),
      query,
      onQueryChange: setQuery,
      onQuerySubmit,
      zoomPercent,
      onRecenter: stage.recenter,
    }),
    [crumb, fullscreenVision, onQuerySubmit, query, stage.exitFullscreen, stage.recenter, zoomPercent],
  );
  useEffect(() => {
    onToolbarChange(toolbarContent);
  }, [onToolbarChange, toolbarContent]);

  /* The file browsers the map mounts report where they are and what is
     selected, for the send button on a line (ADR-0065). One wiring per
     component, made once, so a pane's effect does not re-run per render. */
  const panes = useRef(new Map<string, PaneReport>());
  const [selections, setSelections] = useState<ReadonlyMap<string, readonly PaneEntry[]>>(new Map());
  const onPaneReport = useCallback((paneId: string, report: PaneReport | null): void => {
    if (report === null) panes.current.delete(paneId);
    else panes.current.set(paneId, report);
  }, []);
  const paneWiring = useRef(new Map<string, MapPaneWiring>());
  const wiringFor = useCallback(
    (component: Component): MapPaneWiring => {
      const known = paneWiring.current.get(component.id);
      if (known !== undefined) return known;
      const wiring: MapPaneWiring = {
        paneId: `map-pane-${component.id}`,
        onClose: () => closeComponent(component),
        onReport: onPaneReport,
        onSelectionChange: (entries) =>
          setSelections((current) => {
            if ((current.get(component.id) ?? []).length === 0 && entries.length === 0) return current;
            const next = new Map(current);
            next.set(component.id, entries);
            return next;
          }),
      };
      paneWiring.current.set(component.id, wiring);
      return wiring;
    },
    [closeComponent, onPaneReport],
  );
  const endpointOf = useCallback(
    (component: Component): Endpoint | null => {
      if (component.kind === 'local') return { kind: 'local' };
      if (component.host === undefined) return null;
      const handle = handles.get(component.host);
      return handle === undefined ? null : { kind: 'remote', sessionId: component.host, handle };
    },
    [handles],
  );
  /* Where a send from `id` lands: every destination it has a line to whose
     window is open and connected, with the directory that window shows. */
  const destinationsFor = useCallback(
    (id: string): readonly MapDestination[] => {
      const out: MapDestination[] = [];
      for (const target of destinationsOf(workspace, id)) {
        const component = componentById.get(target);
        if (component === undefined) continue;
        const endpoint = endpointOf(component);
        const pane = panes.current.get(`map-pane-${component.id}`);
        if (endpoint === null || pane === undefined || pane.path === null) continue;
        out.push({ endpoint, dir: pane.path, reload: pane.reload });
      }
      return out;
    },
    [componentById, endpointOf, workspace],
  );
  const [pendingSend, setPendingSend] = useState<{
    readonly from: string;
    readonly source: Endpoint;
    readonly entries: readonly PaneEntry[];
    readonly destinations: readonly MapDestination[];
    readonly names: readonly string[];
  } | null>(null);
  const sendFrom = useCallback(
    (id: string): void => {
      const component = componentById.get(id);
      const entries = selections.get(id) ?? [];
      if (component === undefined || entries.length === 0) return;
      const source = endpointOf(component);
      const destinations = destinationsFor(id);
      if (source === null || destinations.length === 0) return;
      if (destinations.length === 1) {
        onSend(source, entries, destinations);
        return;
      }
      /* More than one destination asks first (ADR-0045, ADR-0065 rule 5). */
      const names = destinationsOf(workspace, id)
        .filter((target) => {
          const component = componentById.get(target);
          return (
            component !== undefined &&
            endpointOf(component) !== null &&
            (panes.current.get(`map-pane-${component.id}`)?.path ?? null) !== null
          );
        })
        .map(nameOf);
      setPendingSend({ from: id, source, entries, destinations, names });
    },
    [componentById, destinationsFor, endpointOf, nameOf, onSend, selections, workspace],
  );

  const frames = useMemo<readonly TerminalFrame[]>(() => {
    const out: TerminalFrame[] = [];
    stage.windows.forEach((window, i) => {
      const component = componentById.get(window.id);
      if (component === undefined || component.kind !== 'ssh' || component.host === undefined) return;
      const handle = handles.get(component.host);
      if (handle === undefined) return;
      const box = terminalBox(
        { left: window.left, top: window.top + STRIP, width: window.width, height: window.height - STRIP },
        stage.view.scale,
        thumbnail ? 'thumbnail' : 'refit',
      );
      out.push({
        sessionId: component.host,
        componentId: component.id,
        handle,
        style: {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          ...(box.scale === 1 ? {} : { transform: `scale(${box.scale})`, transformOrigin: '0 0', pointerEvents: 'none' }),
        },
        bodyId: `map-body-${component.id}`,
        visible: true,
        focused: box.interactive && stage.focused === window.id,
        zIndex: 11 + i * 2,
      });
    });
    return out;
  }, [componentById, handles, stage.focused, stage.view.scale, stage.windows, thumbnail]);

  const hub = stage.positions.get(HUB) ?? { x: 0, y: 0 };
  const worldTransform = `translate(${String(stage.view.x)}px, ${String(stage.view.y)}px) scale(${String(stage.view.scale)})`;

  /* Where a line meets a component, in stage pixels: its window's border
     when open, its icon's when closed, so the line is drawn between the
     two and never under either. */
  const anchorBox = useCallback(
    (id: string): { readonly centre: Point; readonly size: Size } | null => {
      const window = stage.windows.find((one) => one.id === id);
      if (window !== undefined) {
        return {
          centre: { x: window.left + window.width / 2, y: window.top + window.height / 2 },
          size: { w: window.width, h: window.height },
        };
      }
      const at = stage.positions.get(id);
      if (at !== undefined) {
        return { centre: toStage(stage.view, at), size: { w: ICON_BOX.w * stage.view.scale, h: ICON_BOX.h * stage.view.scale } };
      }
      /* A member of a closed vision is behind its aperture, which is where
         a line to it ends (ADR-0067). */
      const vision = visionOfMember.get(id);
      const aperture = vision === undefined ? undefined : stage.positions.get(vision.id);
      if (aperture === undefined) return null;
      return { centre: toStage(stage.view, aperture), size: { w: APERTURE_BOX.w * stage.view.scale, h: APERTURE_BOX.h * stage.view.scale } };
    },
    [stage.positions, stage.view, stage.windows, visionOfMember],
  );
  interface DrawnLine {
    readonly link: Link;
    readonly key: string;
    readonly family: 'terminal' | 'files';
    readonly from: Point;
    readonly to: Point;
    /** Where the handle goes: on the part no window covers, or nowhere. */
    readonly mid: Point | null;
    readonly members: readonly string[];
    /** The set's switch; `off` on a file-browser line, which has none. */
    readonly state: SwitchState;
  }
  const lines = useMemo(() => {
    const out: DrawnLine[] = [];
    if (stage.fullscreen !== null) return out;
    for (const link of workspace.links) {
      const a = componentById.get(link.a);
      const b = componentById.get(link.b);
      if (a === undefined || b === undefined) continue;
      /* Both ends behind one aperture: nothing to draw between (ADR-0067). */
      const behindA = stage.positions.has(link.a) ? null : visionOfMember.get(link.a);
      const behindB = stage.positions.has(link.b) ? null : visionOfMember.get(link.b);
      if (behindA !== null && behindA !== undefined && behindA === behindB) continue;
      const family = familyOf(a.kind);
      if (family === null || family !== familyOf(b.kind)) continue;
      const boxA = anchorBox(link.a);
      const boxB = anchorBox(link.b);
      if (boxA === null || boxB === null) continue;
      const from = edgePoint(boxA.centre, boxA.size, boxB.centre, 2);
      /* A file-browser line stops short of the destination's border so the
         arrowhead shows; a terminal line has nothing to point with. */
      const to = edgePoint(boxB.centre, boxB.size, boxA.centre, family === 'files' ? 8 : 2);
      const members = family === 'terminal' ? linkedSet(workspace, link.a) : [];
      /* A file-browser line is keyed with its direction: the same pair may
         hold one each way, and each needs its own handle. */
      out.push({
        link,
        key: family === 'terminal' ? lineKey(link) : `${link.a}>${link.b}`,
        family,
        from,
        to,
        mid: visibleMidpoint(from, to, stage.windows),
        members,
        state: family === 'terminal' ? switchState(members, armed, receiving) : 'off',
      });
    }
    return out;
  }, [anchorBox, armed, componentById, receiving, stage.fullscreen, stage.positions, stage.windows, visionOfMember, workspace]);
  const linkingFrom = stage.linking === null ? null : anchorBox(stage.linking.from);
  const linkingFamily = stage.linking === null ? null : familyOf(componentById.get(stage.linking.from)?.kind ?? 'monitor');
  const menuTitle = (target: string | null): string => {
    if (target === null || target === HUB) return i18n.t('map.crumb.root');
    if (target.startsWith(LINE_TARGET)) {
      const line = lines.find((one) => `${LINE_TARGET}${one.key}` === target);
      return line === undefined ? '' : lineTitle(line.link);
    }
    if (target.startsWith(TERMINAL_TARGET)) return nameOf(target.slice(TERMINAL_TARGET.length));
    return nameOf(target);
  };
  const lineTitle = useCallback(
    (link: Link): string => i18n.t('map.line.title', { a: nameOf(link.a), b: nameOf(link.b) }),
    [i18n, nameOf],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={stage.setStageElement}
        data-map-stage=""
        /* `isolate`: the windows and the line handles stack inside the
           stage, so their z-indices never reach a dialog portaled to the
           body, which sits above the whole map by being outside it. */
        className={`relative isolate min-h-0 flex-1 overflow-hidden select-none ${
          stage.linking === null ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        }`}
        style={{
          background:
            'radial-gradient(ellipse at 50% 42%, var(--rs-map-vignette), transparent 58%), linear-gradient(var(--rs-surface-base), var(--rs-map-deep))',
        }}
        onPointerDown={stage.onStagePointerDown}
        onWheel={stage.onWheel}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('[data-component],[data-window]') !== null) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          stage.openMenu(null, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onDoubleClick={(event) => {
          if (stage.fullscreen !== null) return;
          if ((event.target as HTMLElement).closest('[data-component],[data-window],button,input') !== null) return;
          stage.fitAll();
        }}
      >
        {/* The floor: a vignette and a faint grid, static. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--rs-map-grid) 1px, transparent 1px), linear-gradient(90deg, var(--rs-map-grid) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            /* A mask reads only alpha: `black` here means opaque, not a colour. */
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 25%, transparent 78%)',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 25%, transparent 78%)',
          }}
        />

        {/* The regions of the open visions: stage pixels, under the world
            and the lines, so a member's icon and the line to it paint over
            the glass, and a press on a member reaches the member rather
            than the region (ADR-0067). */}
        {stage.regions.map((region) => {
          const vision = visionById.get(region.id);
          if (vision === undefined) return null;
          return (
            <div key={region.id} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
              <div className="pointer-events-auto contents">
                <VisionRegion
                  vision={vision}
                  rect={region}
                  bar={REGION.bar * stage.view.scale}
                  focused={stage.focused === region.id}
                  receiving={stage.dropTarget === region.id}
                  maximized={region.maximized === null ? null : nameOf(region.maximized)}
                  onStripPointerDown={(event) => stage.onStripPointerDown(vision.id, event)}
                  onFocus={() => stage.focus(vision.id)}
                  onFit={() => stage.fitVision(vision.id)}
                  onFill={() => stage.enterFullscreen(vision.id)}
                  onClose={() => stage.closeVision(vision.id)}
                  onRestore={() => {
                    if (region.maximized !== null) stage.snapTo(region.maximized, null);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
                    stage.openMenu(vision.id, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* The world: everything that pans and scales. Gone while a vision
            fills the screen; the windows and the terminals are outside it. */}
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: worldTransform }} hidden={stage.fullscreen !== null}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute overflow-visible"
            style={{ left: -20000, top: -20000, width: 40000, height: 40000 }}
            viewBox="-20000 -20000 40000 40000"
          >
            {/* A wire from the rune to each node on the ring: a free
                component or a vision. A member's wire is its vision's. */}
            {[...level.filter((component) => !visionOfMember.has(component.id)), ...levelVisions].map((node) => {
              const at = stage.positions.get(node.id);
              if (at === undefined) return null;
              return (
                <path
                  key={node.id}
                  d={`M${String(hub.x)} ${String(hub.y)} Q${String((hub.x + at.x) / 2)} ${String((hub.y + at.y) / 2)} ${String(at.x)} ${String(at.y)}`}
                  fill="none"
                  stroke="var(--rs-border-strong)"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                  opacity=".35"
                />
              );
            })}
          </svg>

          <div
            role="button"
            tabIndex={0}
            aria-label={i18n.t('map.crumb.root')}
            data-component={HUB}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 select-none"
            style={{ left: hub.x, top: hub.y }}
            onPointerDown={(event) => stage.onNodePointerDown(HUB, event)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
              stage.openMenu(HUB, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
            }}
          >
            <RuneGlyph />
            <span className="text-ink-faint font-mono text-[10.5px] whitespace-nowrap">
              {i18n.t(i18n.plural(level.length) === 'one' ? 'map.status.components.one' : 'map.status.components.other', { count: String(level.length) })}
              {levelVisions.length > 0 &&
                ` · ${i18n.t(i18n.plural(levelVisions.length) === 'one' ? 'map.status.visions.one' : 'map.status.visions.other', { count: String(levelVisions.length) })}`}
            </span>
          </div>

          {levelVisions.map((vision) => {
            const at = stage.positions.get(vision.id);
            if (vision.open || at === undefined) return null;
            return (
              <VisionNode
                key={vision.id}
                vision={vision}
                at={at}
                kinds={vision.components.flatMap((id) => {
                  const member = componentById.get(id);
                  return member === undefined ? [] : [member.kind];
                })}
                dimmed={stage.linking !== null}
                dragging={stage.dragging === vision.id}
                receiving={stage.dropTarget === vision.id}
                onPointerDown={(event) => stage.onNodePointerDown(vision.id, event)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
                  stage.openMenu(vision.id, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                }}
                onKeyOpen={() => stage.openVision(vision.id)}
              />
            );
          })}

          {level.map((component) => {
            const host = hostOf(component);
            const at = stage.positions.get(component.id);
            if (host === undefined || at === undefined || stage.open.has(component.id)) return null;
            return (
              <ComponentNode
                key={component.id}
                component={component}
                host={host}
                at={at}
                connected={component.host !== undefined && handles.has(component.host)}
                dimmed={!matches(component) || (stage.linking !== null && outsideLink(workspace, stage.linking.from, component.id))}
                dragging={stage.dragging === component.id}
                onPointerDown={(event) => stage.onNodePointerDown(component.id, event)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
                  stage.openMenu(component.id, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                }}
                onKeyOpen={() => act(component.id, 'open')}
              />
            );
          })}

          {level.length === 0 && (
            <div
              className="text-ink-faint absolute -translate-x-1/2 text-center text-[11.5px] leading-relaxed whitespace-nowrap"
              style={{ left: hub.x, top: hub.y + 92 }}
            >
              <div className="text-ink-secondary font-semibold">{i18n.t('map.empty.title')}</div>
              <div>{i18n.t('map.empty.body')}</div>
            </div>
          )}
        </div>

        {/* The lines: stage pixels, between the two ends' borders, under the
            windows and over the world (ADR-0065). The one being drawn follows
            the pointer. */}
        {(lines.length > 0 || linkingFrom !== null) && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full">
            <defs>
              <marker id="map-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--rs-state-warn)" />
              </marker>
            </defs>
            {lines.map((line) => (
              <line
                key={line.key}
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={line.state === 'on' || line.family === 'files' ? 'var(--rs-state-warn)' : 'var(--rs-border-strong)'}
                strokeWidth={line.state === 'on' ? 1.8 : 1.4}
                opacity={line.state === 'on' ? 0.9 : line.family === 'files' ? 0.6 : 0.8}
                markerEnd={line.family === 'files' ? 'url(#map-arrowhead)' : undefined}
              />
            ))}
            {linkingFrom !== null && stage.linking !== null && (
              <line
                x1={linkingFrom.centre.x}
                y1={linkingFrom.centre.y}
                x2={stage.linking.pointer.x}
                y2={stage.linking.pointer.y}
                stroke="var(--rs-accent)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            )}
          </svg>
        )}
        {/* The hint as a bar under the toolbar rather than on the pointer,
            which covered the target's label at the moment of reaching it. */}
        {stage.linking !== null && (
          <div
            aria-live="polite"
            className="border-line-strong text-ink-secondary pointer-events-none absolute inset-x-0 top-0 z-[105] flex h-8 items-center gap-2.5 border-b px-3.5 text-[11.5px]"
            style={{ background: 'var(--rs-glass-panel)', backdropFilter: 'blur(var(--rs-glass-blur))', WebkitBackdropFilter: 'blur(var(--rs-glass-blur))' }}
          >
            <span className="text-accent flex shrink-0 items-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
                <circle cx="5" cy="12" r="2.5" />
                <circle cx="19" cy="12" r="2.5" />
                <path d="M7.5 12h9" />
              </svg>
            </span>
            {i18n.t(linkingFamily === 'files' ? 'map.linking.hint.files' : 'map.linking.hint')}
            <kbd className="border-line-strong ml-auto rounded-[3px] border px-1 py-[1px] font-mono text-[10px]">Esc</kbd>
            <span className="text-ink-faint text-[11px]">{i18n.t('map.linking.cancel')}</span>
          </div>
        )}

        {/* The windows: stage pixels, 1:1 whatever the zoom. */}
        {stage.windows.map((window, i) => {
          const component = componentById.get(window.id);
          const host = component === undefined ? undefined : hostOf(component);
          if (component === undefined || host === undefined) return null;
          const handle = component.host === undefined ? undefined : handles.get(component.host);
          const focused = stage.focused === window.id;
          let body: ReactNode = null;
          if (component.kind === 'local') {
            body = renderSftp(component, null, null, wiringFor(component));
          } else if (handle === undefined || host === null) {
            /* Expanded by its vision and never asked to connect, a member
               shows its saved state and the one button that asks (ADR-0067). */
            const attempt = component.host === undefined ? null : attemptSurface(component.host);
            body =
              attempt ??
              (component.host !== undefined && !asked.has(component.host) ? (
                <SavedBody kind={component.kind} onConnect={() => act(component.id, 'open')} />
              ) : (
                <ConnectingBody />
              ));
          } else if (component.kind === 'sftp') {
            body = renderSftp(component, host, handle, wiringFor(component));
          } else if (component.kind === 'monitor') {
            body = renderMonitor(host, handle);
          }
          return (
            <div key={window.id} className="absolute inset-0" style={{ zIndex: 10 + i * 2, pointerEvents: 'none' }}>
              <div className="pointer-events-auto contents">
                <ComponentWindow
                  component={component}
                  host={host}
                  rect={window}
                  snapped={window.cell ? 'full' : window.snapped}
                  focused={focused}
                  connected={component.kind === 'local' || handle !== undefined}
                  dimmed={stage.linking !== null && outsideLink(workspace, stage.linking.from, component.id)}
                  thumbnail={thumbnail}
                  broadcast={component.kind === 'ssh' ? broadcastOf(component.id) : null}
                  onToggleMute={() => toggleMute(component.id)}
                  send={
                    familyOf(component.kind) === 'files' && destinationsOf(workspace, component.id).length > 0
                      ? { count: (selections.get(component.id) ?? []).length, onSend: () => sendFrom(component.id) }
                      : null
                  }
                  bodyId={`map-body-${component.id}`}
                  onStripPointerDown={(event) => stage.onStripPointerDown(component.id, event)}
                  onResizePointerDown={(handleName, event) => stage.onResizePointerDown(component.id, handleName, event)}
                  onFocus={() => {
                    if (!completeLink(component.id)) stage.focus(component.id);
                  }}
                  onMinimize={() => stage.collapse(component.id)}
                  onToggleMaximize={() => stage.toggleMaximize(component.id)}
                  onClose={() => closeComponent(component)}
                  onEditHost={() => {
                    if (component.host !== undefined) onEditHost(component.host);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
                    stage.openMenu(component.id, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                  }}
                >
                  {body}
                </ComponentWindow>
              </div>
            </div>
          );
        })}

        <MapTerminals
          frames={frames}
          onPress={stage.focus}
          onContextMenu={(componentId, at) => stage.openMenu(`${TERMINAL_TARGET}${componentId}`, at)}
          onClipboardHandle={onClipboardHandle}
          {...routedTerminals}
        />

        {lines.map((line) => {
          const at = line.mid;
          if (at === null) return null;
          const onContextMenu = (event: React.MouseEvent): void => {
            event.preventDefault();
            event.stopPropagation();
            const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
            stage.openMenu(`${LINE_TARGET}${line.key}`, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
          };
          if (line.family === 'files') {
            return (
              <LineKnot
                key={line.key}
                at={at}
                label={lineTitle(line.link)}
                onOpen={() => stage.openMenu(`${LINE_TARGET}${line.key}`, at)}
                onContextMenu={onContextMenu}
              />
            );
          }
          return (
            <LineHandle
              key={line.key}
              at={at}
              state={line.state}
              label={lineTitle(line.link)}
              title={i18n.t(line.state === 'on' ? 'map.line.disarm' : line.state === 'idle' ? 'map.line.idle' : 'map.line.arm')}
              onToggle={() => toggleArmed(line.members)}
              onContextMenu={onContextMenu}
            />
          );
        })}

        {stage.snapPreview !== null && (
          <div
            aria-hidden="true"
            className="border-accent-bright pointer-events-none absolute z-[110] rounded-md border-2"
            style={{
              background: 'var(--rs-map-snap)',
              left: stage.snapPreview === 'right' ? '50%' : 0,
              top: 0,
              width: stage.snapPreview === 'full' ? '100%' : '50%',
              height: '100%',
            }}
          />
        )}

        {stage.radial !== null && (
          <Radial
            at={stage.radial.at}
            segment={stage.radial.segment}
            title={stage.radial.target === HUB ? i18n.t('map.crumb.root') : nameOf(stage.radial.target)}
            options={actionsFor(stage.radial.target)
              .filter((item) => item.listOnly !== true)
              .map<RadialOption>((item) => ({ label: item.label, detail: item.detail, color: item.color, danger: item.danger }))}
          />
        )}

        {stage.menu !== null && (
          <MapMenu
            at={stage.menu.at}
            title={menuTitle(stage.menu.target)}
            items={actionsFor(stage.menu.target)}
            onPick={(id) => {
              const target = stage.menu?.target ?? null;
              stage.closeMenu();
              act(target === HUB ? null : target, id);
            }}
            onClose={stage.closeMenu}
          />
        )}
      </div>

      {picker !== null && (
        <HostPicker
          kind={picker.kind}
          changing={picker.changing !== null}
          hosts={hosts}
          refusal={picker.refusal}
          onPick={pick}
          onNewHost={(name) => {
            const ask: HostAsk = { kind: picker.changing === null ? picker.kind : null, changing: picker.changing };
            setPicker(null);
            onNewHost(name, ask);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {hostPopup !== null && (
        <HostPopup title={hostPopup.title} detail={hostPopup.detail} onClose={hostPopup.onClose}>
          {hostPopup.element}
        </HostPopup>
      )}

      {naming !== null && (
        <NameDialog
          title={i18n.t(naming.kind === 'new' ? 'map.vision.name.title.new' : 'map.vision.name.title.rename')}
          body={i18n.t('map.vision.name.body')}
          initial={naming.kind === 'rename' ? (visionById.get(naming.id)?.name ?? '') : ''}
          onSave={(name) => {
            if (naming.kind === 'rename') {
              onChange(renameVision(workspace, naming.id, name));
            } else {
              const outcome = addVision(workspace, name, null);
              if (outcome.ok) onChange(outcome.workspace);
            }
            setNaming(null);
          }}
          onClose={() => setNaming(null)}
        />
      )}

      <AlertDialog
        open={pendingSend !== null}
        onClose={() => setPendingSend(null)}
        onConfirm={() => {
          if (pendingSend !== null) onSend(pendingSend.source, pendingSend.entries, pendingSend.destinations);
          setPendingSend(null);
        }}
        title={i18n.t('map.send.title', { count: String(pendingSend?.destinations.length ?? 0) })}
        description={
          pendingSend === null
            ? ''
            : i18n.t('map.send.body', {
                items: i18n.t(pendingSend.entries.length === 1 ? 'map.send.items.one' : 'map.send.items.other', {
                  count: String(pendingSend.entries.length),
                }),
                origin: nameOf(pendingSend.from),
                destinations: pendingSend.names.join(', '),
              })
        }
        confirmText={i18n.t('map.send.confirm')}
        cancelText={i18n.t('map.send.cancel')}
        variant="primary"
      />
    </div>
  );
}

/** A member a vision expanded without connecting: what it is, and the ask. */
function SavedBody({ kind, onConnect }: { readonly kind: ComponentKind; readonly onConnect: () => void }): JSX.Element {
  const i18n = useTranslator();
  return (
    <div className="text-ink-muted flex h-full flex-col items-center justify-center gap-2 text-[12px]">
      <KindGlyph kind={kind} size={56} />
      <span>{i18n.t('map.vision.saved')}</span>
      <button
        type="button"
        className="border-accent text-accent hover:bg-accent-soft rounded border px-2.5 py-[3px] text-[11px]"
        onClick={onConnect}
      >
        {i18n.t('map.vision.connect')}
      </button>
    </div>
  );
}

function ConnectingBody(): JSX.Element {
  const i18n = useTranslator();
  return (
    <div className="text-ink-faint flex h-full items-center justify-center text-[11.5px]">
      {i18n.t('map.component.connecting')}
    </div>
  );
}

