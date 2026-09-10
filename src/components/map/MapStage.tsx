import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import type { Component, ComponentKind, Link, Point, Session, SessionHandle, Size, Workspace } from '../../ipc';
import { isCursorPositionReport } from '../../features/terminal/clipboard';
import type { MountedTerminal } from '../../features/terminal';
import {
  addComponent,
  addLink,
  canLink,
  changeHost,
  componentsOn,
  defaultSize,
  edgePoint,
  lineKey,
  linkedSet,
  linkedSets,
  mapInputTargets,
  mapReceiving,
  removeComponent,
  removeLink,
  resetPosition,
  setKey,
  terminalBox,
  terminalTreatment,
  toStage,
} from '../../features/map';
import type { AddRefusal, HostAsk } from '../../features/map';
import { HUB, useMapStage } from '../../features/map/use-map-stage';
import { useTranslator } from '../../features/settings';

import { ComponentNode } from './ComponentNode';
import { LineHandle } from './LineHandle';
import { MapTerminals } from './MapTerminals';
import type { TerminalWiring } from './MapTerminals';
import { ComponentWindow } from './ComponentWindow';
import { HostPicker } from './HostPicker';
import { HostPopup } from './HostPopup';
import { MapMenu } from './MapMenu';
import type { MapMenuItem } from './MapMenu';
import { Radial } from './Radial';
import type { RadialOption } from './Radial';
import { RuneGlyph, kindColor } from './glyphs';

/** The strip of a window, in stage pixels: what the body sits below. */
const STRIP = 28;

/** A closed component's box at 100%, for where a line meets its icon. */
const ICON_BOX: Size = { w: 96, h: 112 };

/** The menu target for a line, so one menu path serves nodes and lines. */
const LINE_TARGET = 'line:';

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

export interface HostPopupState {
  readonly title: string;
  readonly detail: string;
  readonly element: ReactNode;
  readonly onClose: () => void;
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
  readonly renderSftp: (session: Session, handle: SessionHandle, onClose: () => void) => ReactNode;
  readonly renderMonitor: (session: Session, handle: SessionHandle) => ReactNode;
  /** How many windows a keystroke typed on the map reaches right now, or
      `null` with no line armed: the status bar's warning edge and its
      announcement (ADR-0019, ADR-0065). */
  readonly onReceivingChange: (count: number | null) => void;
}

interface PickerState {
  readonly kind: ComponentKind;
  /** The component being pointed elsewhere, or `null` when creating. */
  readonly changing: string | null;
  readonly refusal: AddRefusal | null;
}

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
  onReceivingChange,
}: MapStageProps): JSX.Element {
  const i18n = useTranslator();
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [query, setQuery] = useState('');
  /* ADR-0065: the switch per connected set, keyed by the set's members, and
     the windows that spared themselves. In memory only, on purpose: a
     restart never comes up armed, and a set that changed is a new key. */
  const [armed, setArmed] = useState<ReadonlySet<string>>(new Set());
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());

  const level = useMemo(() => componentsOn(workspace, null), [workspace]);
  const byId = useMemo(() => new Map(hosts.map((host) => [host.id, host])), [hosts]);
  const componentById = useMemo(() => new Map(level.map((component) => [component.id, component])), [level]);

  const kindLabel = useCallback(
    (kind: ComponentKind): string =>
      i18n.t(kind === 'ssh' ? 'map.create.ssh' : kind === 'sftp' ? 'map.create.sftp' : 'map.create.monitor'),
    [i18n],
  );

  /* What a hold or a right click offers, built where the state is. */
  const actionsFor = useCallback(
    (target: string | null): readonly (MapMenuItem & { readonly listOnly?: boolean })[] => {
      if (target === null || target === HUB) {
        return CREATE_KINDS.map((kind) => ({
          id: `create:${kind}`,
          label: kindLabel(kind),
          detail: i18n.t('map.create.detail'),
          color: kindColor(kind),
        }));
      }
      if (target.startsWith(LINE_TARGET)) {
        return [{ id: 'unlink', label: i18n.t('map.line.remove'), detail: i18n.t('map.line.remove.detail'), danger: true }];
      }
      const component = componentById.get(target);
      if (component === undefined) return [];
      const items: (MapMenuItem & { readonly listOnly?: boolean })[] = [
        openRef.current.has(target)
          ? { id: 'collapse', label: i18n.t('map.menu.collapse'), detail: i18n.t('map.menu.collapse.detail'), color: kindColor(component.kind) }
          : { id: 'open', label: i18n.t('map.menu.open'), detail: kindLabel(component.kind), color: kindColor(component.kind) },
      ];
      /* A line needs another terminal to reach; with none, the option would
         be a gesture ending nowhere (ADR-0065). */
      if (component.kind === 'ssh' && level.some((other) => other.id !== target && other.kind === 'ssh')) {
        items.push({
          id: 'broadcast',
          label: i18n.t('map.menu.broadcast'),
          detail: i18n.t('map.menu.broadcast.detail'),
          color: 'var(--rs-state-warn)',
        });
      }
      items.push({ id: 'changeHost', label: i18n.t('map.menu.changeHost') }, { id: 'editHost', label: i18n.t('map.menu.editHost') });
      if (handles.has(component.host) || openRef.current.has(target)) {
        items.push({ id: 'close', label: i18n.t('map.menu.close'), detail: i18n.t('map.menu.close.detail'), listOnly: true });
      }
      if (component.position !== undefined) items.push({ id: 'resetPosition', label: i18n.t('map.menu.resetPosition'), listOnly: true });
      if (component.size !== undefined) items.push({ id: 'defaultSize', label: i18n.t('map.menu.defaultSize'), listOnly: true });
      items.push({ id: 'remove', label: i18n.t('map.menu.remove'), detail: i18n.t('map.menu.remove.detail'), danger: true });
      return items;
    },
    [componentById, handles, i18n, kindLabel, level],
  );

  /* The hook is declared below and its callbacks are read through these
     refs by the closures above it, so that the menu's actions and the
     hook can each mention the other without a cycle in declaration order,
     and without a stale set of open windows captured by a memoised callback. */
  const openRef = useRef<ReadonlySet<string>>(new Set());
  const collapseRef = useRef<(id: string) => void>(() => {});
  const openWindowRef = useRef<(id: string) => void>(() => {});
  const focusRef = useRef<(id: string) => void>(() => {});
  const startLinkRef = useRef<(id: string) => void>(() => {});

  const closeComponent = useCallback(
    (component: Component): void => {
      collapseRef.current(component.id);
      const othersOpen = level.some(
        (other) => other.id !== component.id && other.host === component.host && openRef.current.has(other.id),
      );
      if (!othersOpen && handles.has(component.host)) onDisconnect(component.host);
    },
    [handles, level, onDisconnect],
  );

  const act = useCallback(
    (target: string | null, action: string): void => {
      if (action.startsWith('create:')) {
        const kind = action.slice('create:'.length) as ComponentKind;
        setPicker({ kind, changing: null, refusal: null });
        return;
      }
      if (target === null) return;
      if (target.startsWith(LINE_TARGET)) {
        if (action !== 'unlink') return;
        const [a, b] = target.slice(LINE_TARGET.length).split('~');
        if (a !== undefined && b !== undefined) onChange(removeLink(workspace, a, b));
        return;
      }
      const component = componentById.get(target);
      if (component === undefined) return;
      switch (action) {
        case 'open':
          openWindowRef.current(component.id);
          if (!handles.has(component.host)) onConnect(component.host);
          return;
        case 'broadcast':
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
          onEditHost(component.host);
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
    [closeComponent, componentById, handles, onChange, onConnect, onEditHost, workspace],
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
    onChange,
    radialOptions: (id) => actionsFor(id).filter((item) => item.listOnly !== true).length,
    onClick: (id) => {
      if (completeLink(id)) return;
      if (id === HUB) return;
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
      const host = byId.get(component.host);
      if (host === undefined) return false;
      return `${host.name} ${host.host} ${host.user}`.toLowerCase().includes(needle);
    },
    [byId, needle],
  );

  const frames = useMemo<readonly TerminalFrame[]>(() => {
    const out: TerminalFrame[] = [];
    stage.windows.forEach((window, i) => {
      const component = componentById.get(window.id);
      if (component === undefined || component.kind !== 'ssh') return;
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
      if (at === undefined) return null;
      return { centre: toStage(stage.view, at), size: { w: ICON_BOX.w * stage.view.scale, h: ICON_BOX.h * stage.view.scale } };
    },
    [stage.positions, stage.view, stage.windows],
  );
  const lines = useMemo(() => {
    const out: { readonly link: Link; readonly key: string; readonly from: Point; readonly to: Point; readonly mid: Point; readonly members: readonly string[]; readonly on: boolean }[] = [];
    for (const link of workspace.links) {
      const a = componentById.get(link.a);
      const b = componentById.get(link.b);
      if (a?.kind !== 'ssh' || b?.kind !== 'ssh') continue;
      const boxA = anchorBox(link.a);
      const boxB = anchorBox(link.b);
      if (boxA === null || boxB === null) continue;
      const from = edgePoint(boxA.centre, boxA.size, boxB.centre, 2);
      const to = edgePoint(boxB.centre, boxB.size, boxA.centre, 2);
      const members = linkedSet(workspace, link.a);
      out.push({
        link,
        key: lineKey(link),
        from,
        to,
        mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        members,
        on: armed.has(setKey(members)),
      });
    }
    return out;
  }, [anchorBox, armed, componentById, workspace]);
  const linkingFrom = stage.linking === null ? null : anchorBox(stage.linking.from);
  const menuTitle = (target: string | null): string => {
    if (target === null || target === HUB) return i18n.t('map.crumb.root');
    if (target.startsWith(LINE_TARGET)) {
      const line = lines.find((one) => `${LINE_TARGET}${one.key}` === target);
      return line === undefined ? '' : lineTitle(line.link);
    }
    return byId.get(componentById.get(target)?.host ?? '')?.name ?? '';
  };
  const lineTitle = useCallback(
    (link: Link): string => {
      const name = (id: string): string => byId.get(componentById.get(id)?.host ?? '')?.name ?? '';
      return i18n.t('map.line.title', { a: name(link.a), b: name(link.b) });
    },
    [byId, componentById, i18n],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line-subtle bg-surface-panel flex h-[34px] shrink-0 items-center gap-2 border-b px-2.5">
        <span className="text-ink text-[12px] font-semibold">{i18n.t('map.crumb.root')}</span>
        <span className="flex-1" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const first = level.find(matches);
            if (first !== undefined) act(first.id, stage.open.has(first.id) ? 'collapse' : 'open');
          }}
          placeholder={i18n.t('map.toolbar.search')}
          aria-label={i18n.t('map.toolbar.search')}
          className="bg-surface-input border-line-subtle focus:border-accent text-ink h-6 w-[280px] rounded border px-2 text-[12px] outline-none"
        />
        <span className="text-ink-faint font-mono text-[10.5px] tabular-nums">
          {i18n.t('map.toolbar.zoom', { percent: String(Math.round(stage.view.scale * 100)) })}
        </span>
        <button
          type="button"
          className="border-line-subtle text-ink-muted hover:text-ink hover:border-line-strong h-6 rounded border px-2.5 text-[11px]"
          onClick={stage.recenter}
        >
          {i18n.t('map.toolbar.recenter')}
        </button>
      </div>

      <div
        ref={stage.setStageElement}
        data-map-stage=""
        className={`relative min-h-0 flex-1 overflow-hidden select-none ${
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

        {/* The world: everything that pans and scales. */}
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: worldTransform }}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute overflow-visible"
            style={{ left: -20000, top: -20000, width: 40000, height: 40000 }}
            viewBox="-20000 -20000 40000 40000"
          >
            {level.map((component) => {
              const at = stage.positions.get(component.id);
              if (at === undefined) return null;
              return (
                <path
                  key={component.id}
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
            <span className="text-ink-faint font-mono text-[10.5px]">
              {i18n.t(i18n.plural(level.length) === 'one' ? 'map.status.components.one' : 'map.status.components.other', { count: String(level.length) })}
            </span>
          </div>

          {level.map((component) => {
            const host = byId.get(component.host);
            const at = stage.positions.get(component.id);
            if (host === undefined || at === undefined || stage.open.has(component.id)) return null;
            return (
              <ComponentNode
                key={component.id}
                component={component}
                host={host}
                at={at}
                connected={handles.has(component.host)}
                dimmed={
                  !matches(component) ||
                  (stage.linking !== null &&
                    stage.linking.from !== component.id &&
                    canLink(workspace, stage.linking.from, component.id) !== null)
                }
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
            {lines.map((line) => (
              <line
                key={line.key}
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                stroke={line.on ? 'var(--rs-state-warn)' : 'var(--rs-border-strong)'}
                strokeWidth={line.on ? 1.8 : 1.4}
                opacity={line.on ? 0.9 : 0.8}
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
        {stage.linking !== null && (
          <div
            aria-live="polite"
            className="bg-surface-panel border-line-strong text-ink-secondary pointer-events-none absolute z-[105] rounded border px-2 py-1 text-[11px] whitespace-nowrap shadow-3"
            style={{ left: stage.linking.pointer.x + 16, top: stage.linking.pointer.y + 16 }}
          >
            {i18n.t('map.linking.hint')}
          </div>
        )}

        {/* The windows: stage pixels, 1:1 whatever the zoom. */}
        {stage.windows.map((window, i) => {
          const component = componentById.get(window.id);
          const host = component === undefined ? undefined : byId.get(component.host);
          if (component === undefined || host === undefined) return null;
          const handle = handles.get(component.host);
          const focused = stage.focused === window.id;
          let body: ReactNode = null;
          if (handle === undefined) {
            body = attemptSurface(component.host) ?? <ConnectingBody />;
          } else if (component.kind === 'sftp') {
            body = renderSftp(host, handle, () => closeComponent(component));
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
                  snapped={window.snapped}
                  focused={focused}
                  connected={handle !== undefined}
                  thumbnail={thumbnail}
                  broadcast={broadcastOf(component.id)}
                  onToggleMute={() => toggleMute(component.id)}
                  bodyId={`map-body-${component.id}`}
                  onStripPointerDown={(event) => stage.onStripPointerDown(component.id, event)}
                  onResizePointerDown={(handleName, event) => stage.onResizePointerDown(component.id, handleName, event)}
                  onFocus={() => {
                    if (!completeLink(component.id)) stage.focus(component.id);
                  }}
                  onMinimize={() => stage.collapse(component.id)}
                  onToggleMaximize={() => stage.toggleMaximize(component.id)}
                  onClose={() => closeComponent(component)}
                  onEditHost={() => onEditHost(component.host)}
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

        <MapTerminals frames={frames} onPress={stage.focus} {...routedTerminals} />

        {lines.map((line) => (
          <LineHandle
            key={line.key}
            at={line.mid}
            on={line.on}
            label={lineTitle(line.link)}
            title={i18n.t(line.on ? 'map.line.disarm' : 'map.line.arm')}
            onToggle={() => toggleArmed(line.members)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
              stage.openMenu(`${LINE_TARGET}${line.key}`, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
            }}
          />
        ))}

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
            title={stage.radial.target === HUB ? i18n.t('map.crumb.root') : (byId.get(componentById.get(stage.radial.target)?.host ?? '')?.name ?? '')}
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

