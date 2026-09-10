/**
 * Everything that moves on the map, kept out of the components.
 *
 * The stage owns the view (pan and zoom), which components are expanded
 * into their windows, which one has focus, which are snapped off the map,
 * and the press in progress. The arithmetic is in `layout.ts`, `gestures.ts`
 * and `windows.ts`; this file is the wiring between pointer events and
 * those functions, and the teardown of every listener and timer it takes.
 *
 * Positions and sizes that outlive the session are not state here: a drag
 * or a resize ends in a call to `onChange` with the next `Workspace`, and
 * the shell owns that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';

import type { Component, Point, Workspace } from '../../ipc';

import { HOLD_MS, beginPress, holdFired, movePress, radialSegment, releasePress } from './gestures';
import type { Press } from './gestures';
import { HOME_VIEW, ZOOM_MAX, ZOOM_MIN, fitTo, pan, placeChildren, ringRadiusFor, toMap, toStage, zoomAt } from './layout';
import type { Rect, View } from './layout';
import { moveComponent, resizeComponent, sizeOf } from './model';
import { keepInside, resizeFrom, snapRect, snapZone } from './windows';
import type { ResizeHandle, SnapSide, StageRect } from './windows';

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

/** A radial menu open over a node, following the pointer. */
export interface RadialState {
  readonly target: string;
  readonly at: Point;
  readonly count: number;
  readonly segment: number;
}

/** A context menu open at a point on the stage, for a node or the level. */
export interface MenuState {
  readonly target: string | null;
  readonly at: Point;
}

/** Where a component's window sits on the stage, in stage pixels. */
export interface WindowRect extends StageRect {
  readonly id: string;
  readonly snapped: SnapSide | null;
}

export interface MapStageApi {
  readonly view: View;
  readonly stageSize: StageSize;
  readonly open: ReadonlySet<string>;
  readonly focused: string | null;
  readonly snapped: ReadonlyMap<string, SnapSide>;
  readonly radial: RadialState | null;
  readonly menu: MenuState | null;
  readonly dragging: string | null;
  readonly snapPreview: SnapSide | null;
  /** Where each node's centre is, in map pixels, drags included. */
  readonly positions: ReadonlyMap<string, Point>;
  /** Where each open window sits, in stage pixels. */
  readonly windows: readonly WindowRect[];
  readonly setStageElement: (element: HTMLDivElement | null) => void;
  readonly onNodePointerDown: (id: string, event: ReactPointerEvent) => void;
  readonly onStripPointerDown: (id: string, event: ReactPointerEvent) => void;
  readonly onResizePointerDown: (id: string, handle: ResizeHandle, event: ReactPointerEvent) => void;
  readonly onStagePointerDown: (event: ReactPointerEvent) => void;
  readonly onWheel: (event: ReactWheelEvent) => void;
  readonly openWindow: (id: string) => void;
  readonly collapse: (id: string) => void;
  readonly focus: (id: string) => void;
  readonly toggleMaximize: (id: string) => void;
  readonly snapTo: (id: string, side: SnapSide | null) => void;
  readonly openMenu: (target: string | null, at: Point) => void;
  readonly closeMenu: () => void;
  readonly closeRadial: () => void;
  readonly recenter: () => void;
  readonly fitAll: () => void;
}

interface Options {
  readonly workspace: Workspace;
  readonly components: readonly Component[];
  readonly onChange: (next: Workspace) => void;
  /** How many radial options a hold on `id` offers; `0` means no radial. */
  readonly radialOptions: (id: string) => number;
  /** A press that ended as a click. */
  readonly onClick: (id: string) => void;
  /** A hold that ended on a segment. */
  readonly onRadialPick: (id: string, segment: number) => void;
}

type Tracking =
  | { readonly kind: 'press'; press: Press; readonly offset: Point; readonly element: string }
  | { readonly kind: 'pan'; last: Point; velocity: Point; at: number }
  | {
      readonly kind: 'resize';
      readonly id: string;
      readonly handle: ResizeHandle;
      readonly origin: Point;
      readonly start: { readonly w: number; readonly h: number };
      readonly centre: Point;
    }
  | { readonly kind: 'radial'; readonly id: string; readonly origin: Point };

/** The hub's own key in the positions map. */
export const HUB = 'hub';

export function useMapStage({ workspace, components, onChange, radialOptions, onClick, onRadialPick }: Options): MapStageApi {
  const [view, setView] = useState<View>(HOME_VIEW);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [snapped, setSnapped] = useState<ReadonlyMap<string, SnapSide>>(new Map());
  const [radial, setRadial] = useState<RadialState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);
  const [resizing, setResizing] = useState<{ id: string; size: { w: number; h: number }; centre: Point } | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapSide | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const tracking = useRef<Tracking | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flingFrame = useRef<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  /* Measured rather than assumed: the ring's radius and the fit-to-all
     scale both depend on how much room the stage actually has. */
  const setStageElement = useCallback((element: HTMLDivElement | null): void => {
    stageRef.current = element;
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (element === null) return;
    const measure = (): void => {
      setStageSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const centre = useMemo<Point>(() => ({ x: stageSize.width / 2, y: stageSize.height / 2 }), [stageSize]);

  const positions = useMemo<ReadonlyMap<string, Point>>(() => {
    const placed = placeChildren(components, centre, ringRadiusFor(stageSize.width, stageSize.height));
    const map = new Map<string, Point>([[HUB, centre]]);
    components.forEach((component, i) => {
      const at = placed[i] ?? centre;
      map.set(component.id, dragging === component.id && dragPosition !== null ? dragPosition : at);
    });
    if (resizing !== null) map.set(resizing.id, resizing.centre);
    return map;
  }, [components, centre, stageSize, dragging, dragPosition, resizing]);

  const windows = useMemo<readonly WindowRect[]>(() => {
    const out: WindowRect[] = [];
    for (const component of components) {
      if (!open.has(component.id)) continue;
      const side = snapped.get(component.id) ?? null;
      if (side !== null) {
        out.push({ id: component.id, snapped: side, ...snapRect(side, stageSize.width, stageSize.height) });
        continue;
      }
      const size = resizing !== null && resizing.id === component.id ? resizing.size : sizeOf(component);
      const at = positions.get(component.id) ?? centre;
      const topLeft = toStage(view, { x: at.x - size.w / 2, y: at.y - size.h / 2 });
      out.push({
        id: component.id,
        snapped: null,
        ...keepInside(
          { left: topLeft.x, top: topLeft.y, width: size.w * view.scale, height: size.h * view.scale },
          stageSize.width,
          stageSize.height,
        ),
      });
    }
    /* Focus last, so it paints on top. */
    out.sort((a, b) => (a.id === focused ? 1 : 0) - (b.id === focused ? 1 : 0));
    return out;
  }, [components, open, snapped, resizing, positions, centre, view, stageSize, focused]);

  const stagePoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const clearHold = useCallback((): void => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const stopFling = useCallback((): void => {
    if (flingFrame.current !== null) {
      cancelAnimationFrame(flingFrame.current);
      flingFrame.current = null;
    }
  }, []);

  const capture = useCallback((event: ReactPointerEvent): void => {
    const element = stageRef.current;
    /* jsdom has no pointer capture; a stage without it still tracks the
       pointer through the window listeners below, only less politely. */
    if (element !== null && typeof element.setPointerCapture === 'function') element.setPointerCapture(event.pointerId);
  }, []);

  const focus = useCallback((id: string): void => setFocused(id), []);

  const openWindow = useCallback((id: string): void => {
    setOpen((current) => (current.has(id) ? current : new Set([...current, id])));
    setFocused(id);
  }, []);

  const collapse = useCallback((id: string): void => {
    setOpen((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSnapped((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setFocused((current) => (current === id ? null : current));
  }, []);

  const snapTo = useCallback((id: string, side: SnapSide | null): void => {
    setSnapped((current) => {
      const next = new Map(current);
      if (side === null) next.delete(id);
      else next.set(id, side);
      return next;
    });
    setOpen((current) => (current.has(id) ? current : new Set([...current, id])));
    setFocused(id);
  }, []);

  const toggleMaximize = useCallback(
    (id: string): void => {
      snapTo(id, snapped.get(id) === 'full' ? null : 'full');
    },
    [snapTo, snapped],
  );

  const openMenu = useCallback((target: string | null, at: Point): void => setMenu({ target, at }), []);
  const closeMenu = useCallback((): void => setMenu(null), []);
  const closeRadial = useCallback((): void => {
    setRadial(null);
    if (tracking.current?.kind === 'radial') tracking.current = null;
  }, []);

  /* A node pressed: a click, a hold or a drag, decided by `gestures.ts`. */
  const onNodePointerDown = useCallback(
    (id: string, event: ReactPointerEvent): void => {
      if (event.button !== 0) return;
      event.stopPropagation();
      stopFling();
      setMenu(null);
      const at = stagePoint(event);
      const here = positions.get(id) ?? centre;
      const mapAt = toMap(viewRef.current, at);
      tracking.current = {
        kind: 'press',
        press: beginPress(id, at, performance.now()),
        offset: { x: here.x - mapAt.x, y: here.y - mapAt.y },
        element: id,
      };
      capture(event);
      clearHold();
      const count = radialOptions(id);
      if (count > 0) {
        holdTimer.current = setTimeout(() => {
          const current = tracking.current;
          if (current?.kind !== 'press') return;
          const held = holdFired(current.press, performance.now());
          if (held.phase !== 'held') return;
          tracking.current = { kind: 'radial', id, origin: current.press.origin };
          setRadial({ target: id, at: current.press.origin, count, segment: -1 });
        }, HOLD_MS);
      }
    },
    [capture, centre, clearHold, positions, radialOptions, stagePoint, stopFling],
  );

  /* A window's title bar pressed: a drag from the first pixel, no hold. */
  const onStripPointerDown = useCallback(
    (id: string, event: ReactPointerEvent): void => {
      if (event.button !== 0) return;
      event.stopPropagation();
      stopFling();
      setFocused(id);
      if (snapped.has(id)) return;
      const at = stagePoint(event);
      const here = positions.get(id) ?? centre;
      const mapAt = toMap(viewRef.current, at);
      const press: Press = { ...beginPress(id, at, performance.now()), phase: 'dragging' };
      tracking.current = { kind: 'press', press, offset: { x: here.x - mapAt.x, y: here.y - mapAt.y }, element: id };
      capture(event);
    },
    [capture, centre, positions, snapped, stagePoint, stopFling],
  );

  const onResizePointerDown = useCallback(
    (id: string, handle: ResizeHandle, event: ReactPointerEvent): void => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const component = components.find((one) => one.id === id);
      if (component === undefined || snapped.has(id)) return;
      const size = sizeOf(component);
      tracking.current = {
        kind: 'resize',
        id,
        handle,
        origin: stagePoint(event),
        start: size,
        centre: positions.get(id) ?? centre,
      };
      setFocused(id);
      setResizing({ id, size, centre: positions.get(id) ?? centre });
      capture(event);
    },
    [capture, centre, components, positions, snapped, stagePoint],
  );

  const onStagePointerDown = useCallback(
    (event: ReactPointerEvent): void => {
      if (event.button !== 0) return;
      stopFling();
      setMenu(null);
      const at = stagePoint(event);
      tracking.current = { kind: 'pan', last: at, velocity: { x: 0, y: 0 }, at: performance.now() };
      capture(event);
    },
    [capture, stagePoint, stopFling],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const current = tracking.current;
      if (current === null) return;
      const at = stagePoint(event);
      switch (current.kind) {
        case 'press': {
          const next = movePress(current.press, at);
          if (next.phase === 'dragging') {
            if (current.press.phase !== 'dragging') clearHold();
            current.press = next;
            const mapAt = toMap(viewRef.current, at);
            setDragging(current.element);
            setDragPosition({ x: mapAt.x + current.offset.x, y: mapAt.y + current.offset.y });
            setSnapPreview(snapZone(at, stageSize.width));
          }
          return;
        }
        case 'pan': {
          const now = performance.now();
          const dx = at.x - current.last.x;
          const dy = at.y - current.last.y;
          const dt = Math.max(1, now - current.at);
          current.velocity = { x: (dx / dt) * 16, y: (dy / dt) * 16 };
          current.last = at;
          current.at = now;
          setView((v) => pan(v, dx, dy));
          return;
        }
        case 'resize': {
          const scale = viewRef.current.scale;
          const delta = { x: (at.x - current.origin.x) / scale, y: (at.y - current.origin.y) / scale };
          const resized = resizeFrom(current.handle, current.start, delta);
          setResizing({
            id: current.id,
            size: resized.size,
            centre: { x: current.centre.x + resized.centreShift.x, y: current.centre.y + resized.centreShift.y },
          });
          return;
        }
        case 'radial': {
          setRadial((r) => (r === null ? r : { ...r, segment: radialSegment(current.origin, at, r.count) }));
          return;
        }
      }
    };

    const onUp = (event: PointerEvent): void => {
      const current = tracking.current;
      tracking.current = null;
      clearHold();
      if (current === null) return;
      switch (current.kind) {
        case 'press': {
          const outcome = releasePress(current.press);
          if (outcome.kind === 'drag') {
            const at = stagePoint(event);
            const side = snapZone(at, stageSize.width);
            setDragging(null);
            setDragPosition(null);
            setSnapPreview(null);
            if (side !== null && open.has(current.element)) {
              snapTo(current.element, side);
              return;
            }
            const mapAt = toMap(viewRef.current, at);
            onChange(
              moveComponent(workspaceRef.current, current.element, {
                x: Math.round(mapAt.x + current.offset.x),
                y: Math.round(mapAt.y + current.offset.y),
              }),
            );
            return;
          }
          if (outcome.kind === 'click') onClick(current.element);
          return;
        }
        case 'pan': {
          const { velocity } = current;
          if (performance.now() - current.at > 60) return;
          if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          let vx = velocity.x;
          let vy = velocity.y;
          const step = (): void => {
            if (Math.hypot(vx, vy) < 0.3) {
              flingFrame.current = null;
              return;
            }
            setView((v) => pan(v, vx, vy));
            vx *= 0.92;
            vy *= 0.92;
            flingFrame.current = requestAnimationFrame(step);
          };
          flingFrame.current = requestAnimationFrame(step);
          return;
        }
        case 'resize': {
          setResizing((state) => {
            if (state !== null) {
              const moved = moveComponent(workspaceRef.current, state.id, {
                x: Math.round(state.centre.x),
                y: Math.round(state.centre.y),
              });
              onChange(resizeComponent(moved, state.id, state.size));
            }
            return null;
          });
          return;
        }
        case 'radial': {
          setRadial((r) => {
            if (r !== null && r.segment >= 0) onRadialPick(r.target, r.segment);
            return null;
          });
          return;
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clearHold();
      stopFling();
    };
  }, [clearHold, onChange, onClick, onRadialPick, open, snapTo, stagePoint, stageSize.width, stopFling]);

  const onWheel = useCallback(
    (event: ReactWheelEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null && target.closest('[data-map-scrolls]') !== null) return;
      event.preventDefault();
      stopFling();
      setView((v) => zoomAt(v, stagePoint(event), event.deltaY > 0 ? 0.9 : 1.1));
    },
    [stagePoint, stopFling],
  );

  const recenter = useCallback((): void => {
    stopFling();
    setView(HOME_VIEW);
  }, [stopFling]);

  const fitAll = useCallback((): void => {
    stopFling();
    if (components.length === 0) {
      setView(HOME_VIEW);
      return;
    }
    let rect: Rect | null = null;
    for (const component of components) {
      const at = positions.get(component.id) ?? centre;
      const half = open.has(component.id) ? { x: sizeOf(component).w / 2, y: sizeOf(component).h / 2 } : { x: 52, y: 62 };
      const box: Rect = { left: at.x - half.x, top: at.y - half.y, right: at.x + half.x, bottom: at.y + half.y };
      rect =
        rect === null
          ? box
          : {
              left: Math.min(rect.left, box.left),
              top: Math.min(rect.top, box.top),
              right: Math.max(rect.right, box.right),
              bottom: Math.max(rect.bottom, box.bottom),
            };
    }
    if (rect !== null) setView(fitTo(rect, stageSize.width, stageSize.height));
  }, [centre, components, open, positions, stageSize, stopFling]);

  return {
    view: { ...view, scale: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.scale)) },
    stageSize,
    open,
    focused,
    snapped,
    radial,
    menu,
    dragging,
    snapPreview,
    positions,
    windows,
    setStageElement,
    onNodePointerDown,
    onStripPointerDown,
    onResizePointerDown,
    onStagePointerDown,
    onWheel,
    openWindow,
    collapse,
    focus,
    toggleMaximize,
    snapTo,
    openMenu,
    closeMenu,
    closeRadial,
    recenter,
    fitAll,
  };
}
