import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

import type { Component, ComponentKind, Session, SessionHandle, Workspace } from '../../ipc';
import type { MountedTerminal } from '../../features/terminal';
import {
  addComponent,
  changeHost,
  componentsOn,
  defaultSize,
  removeComponent,
  resetPosition,
  terminalTreatment,
} from '../../features/map';
import type { AddRefusal } from '../../features/map';
import { HUB, useMapStage } from '../../features/map/use-map-stage';
import { useTranslator } from '../../features/settings';

import { ComponentNode } from './ComponentNode';
import { MapTerminals } from './MapTerminals';
import type { TerminalWiring } from './MapTerminals';
import { ComponentWindow } from './ComponentWindow';
import { HostPicker } from './HostPicker';
import { MapMenu } from './MapMenu';
import type { MapMenuItem } from './MapMenu';
import { Radial } from './Radial';
import type { RadialOption } from './Radial';
import { RuneGlyph, kindColor } from './glyphs';

/** The strip of a window, in stage pixels: what the body sits below. */
const STRIP = 28;

/** Where a terminal is drawn, relative to the map's own main area. */
export interface TerminalFrame {
  readonly sessionId: string;
  readonly handle: SessionHandle;
  readonly style: CSSProperties;
  /** The window body's element id, which the terminal is labelled by. */
  readonly bodyId: string;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly zIndex: number;
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
  readonly onEditHost: (sessionId: string) => void;
  readonly onNewHost: (name: string) => void;
  /** The terminals: which are mounted, and what the shell wires into each.
      Mounted here in one stable stack (ADR-0014) and aimed at the frames
      this stage computes. */
  readonly terminals: TerminalWiring & { readonly mounted: readonly MountedTerminal[] };
  readonly renderSftp: (session: Session, handle: SessionHandle, onClose: () => void) => ReactNode;
  readonly renderMonitor: (session: Session, handle: SessionHandle) => ReactNode;
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
  terminals,
  renderSftp,
  renderMonitor,
}: MapStageProps): JSX.Element {
  const i18n = useTranslator();
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [query, setQuery] = useState('');

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
      const component = componentById.get(target);
      if (component === undefined) return [];
      const items: (MapMenuItem & { readonly listOnly?: boolean })[] = [
        openRef.current.has(target)
          ? { id: 'collapse', label: i18n.t('map.menu.collapse'), detail: i18n.t('map.menu.collapse.detail'), color: kindColor(component.kind) }
          : { id: 'open', label: i18n.t('map.menu.open'), detail: kindLabel(component.kind), color: kindColor(component.kind) },
        { id: 'changeHost', label: i18n.t('map.menu.changeHost') },
        { id: 'editHost', label: i18n.t('map.menu.editHost') },
      ];
      if (handles.has(component.host) || openRef.current.has(target)) {
        items.push({ id: 'close', label: i18n.t('map.menu.close'), detail: i18n.t('map.menu.close.detail'), listOnly: true });
      }
      if (component.position !== undefined) items.push({ id: 'resetPosition', label: i18n.t('map.menu.resetPosition'), listOnly: true });
      if (component.size !== undefined) items.push({ id: 'defaultSize', label: i18n.t('map.menu.defaultSize'), listOnly: true });
      items.push({ id: 'remove', label: i18n.t('map.menu.remove'), detail: i18n.t('map.menu.remove.detail'), danger: true });
      return items;
    },
    [componentById, handles, i18n, kindLabel],
  );

  /* The hook is declared below and its callbacks are read through these
     refs by the closures above it, so that the menu's actions and the
     hook can each mention the other without a cycle in declaration order,
     and without a stale set of open windows captured by a memoised callback. */
  const openRef = useRef<ReadonlySet<string>>(new Set());
  const collapseRef = useRef<(id: string) => void>(() => {});
  const openWindowRef = useRef<(id: string) => void>(() => {});
  const focusRef = useRef<(id: string) => void>(() => {});

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
      const component = componentById.get(target);
      if (component === undefined) return;
      switch (action) {
        case 'open':
          openWindowRef.current(component.id);
          if (!handles.has(component.host)) onConnect(component.host);
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

  const stage = useMapStage({
    workspace,
    components: level,
    onChange,
    radialOptions: (id) => actionsFor(id).filter((item) => item.listOnly !== true).length,
    onClick: (id) => {
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
      out.push({
        sessionId: component.host,
        handle,
        style: { left: window.left, top: window.top + STRIP, width: window.width, height: window.height - STRIP },
        bodyId: `map-body-${component.id}`,
        visible: !thumbnail,
        focused: stage.focused === window.id,
        zIndex: 11 + i * 2,
      });
    });
    return out;
  }, [componentById, handles, stage.focused, stage.windows, thumbnail]);

  const hub = stage.positions.get(HUB) ?? { x: 0, y: 0 };
  const worldTransform = `translate(${String(stage.view.x)}px, ${String(stage.view.y)}px) scale(${String(stage.view.scale)})`;

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
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing select-none"
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
                dimmed={!matches(component)}
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
                  bodyId={`map-body-${component.id}`}
                  onStripPointerDown={(event) => stage.onStripPointerDown(component.id, event)}
                  onResizePointerDown={(handleName, event) => stage.onResizePointerDown(component.id, handleName, event)}
                  onFocus={() => stage.focus(component.id)}
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

        <MapTerminals frames={frames} {...terminals} />

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
            title={
              stage.menu.target === null || stage.menu.target === HUB
                ? i18n.t('map.crumb.root')
                : (byId.get(componentById.get(stage.menu.target)?.host ?? '')?.name ?? '')
            }
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
            setPicker(null);
            onNewHost(name);
          }}
          onClose={() => setPicker(null)}
        />
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

