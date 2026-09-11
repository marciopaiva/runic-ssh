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

import type { Component, Point, Vision, Workspace } from '../../ipc';

import { HOLD_MS, beginPress, holdFired, movePress, radialSegment, releasePress } from './gestures';
import type { Press } from './gestures';
import { HOME_VIEW, REFIT_MIN, ZOOM_MAX, ZOOM_MIN, fitTo, pan, placeChildren, ringRadiusFor, toMap, toStage, zoomAt } from './layout';
import type { Rect, View } from './layout';
import { moveComponent, resizeComponent, sizeOf } from './model';
import { MEMBER_ICON, REGION, addMember, fullScreenFrames, layoutVision, moveVision, removeMember, setVisionOpen } from './visions';
import type { MemberBox } from './visions';
import { keepInside, resizeFrom, snapRect, snapZone } from './windows';
import type { ResizeHandle, SnapSide, StageRect } from './windows';

/** The bar over a vision filling the screen, in stage pixels. */
export const FULLSCREEN_BAR = 36;
/** Between the cells of a vision filling the screen, in stage pixels. */
export const FULLSCREEN_GAP = 8;
/** How near an aperture a drop has to land, in map pixels, to join the vision. */
const APERTURE_REACH = 64;
/** How long the view takes to glide to a window that just opened: the
    `--rs-duration-normal` of ADR-0063, in milliseconds. */
export const REVEAL_MS = 200;

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

/** A line being drawn from a component to wherever the pointer is (ADR-0065). */
export interface LinkingState {
  readonly from: string;
  /** In stage pixels. */
  readonly pointer: Point;
}

/** Where a component's window sits on the stage, in stage pixels. */
export interface WindowRect extends StageRect {
  readonly id: string;
  readonly snapped: SnapSide | null;
  /** A frame the vision fixed, filling the screen or its region: neither
      dragged nor resized, since its size is the shape's (ADR-0067). */
  readonly cell: boolean;
}

/** Where an open vision's region sits on the stage, in stage pixels (ADR-0067). */
export interface RegionRect extends StageRect {
  readonly id: string;
  /** The member maximized inside it, if one is. */
  readonly maximized: string | null;
}

export interface MapStageApi {
  readonly view: View;
  readonly stageSize: StageSize;
  readonly open: ReadonlySet<string>;
  readonly focused: string | null;
  readonly snapped: ReadonlyMap<string, SnapSide>;
  readonly radial: RadialState | null;
  readonly menu: MenuState | null;
  readonly linking: LinkingState | null;
  readonly dragging: string | null;
  readonly snapPreview: SnapSide | null;
  /** The vision a dragged component would join if dropped now (ADR-0067). */
  readonly dropTarget: string | null;
  /** The vision filling the screen, or `null` on the map. */
  readonly fullscreen: string | null;
  /** Where each node's centre is, in map pixels, drags included: a free
      component, a member of an open vision, a vision's own corner
      (open) or aperture (closed). A member of a closed vision has none. */
  readonly positions: ReadonlyMap<string, Point>;
  /** Where each open window sits, in stage pixels. */
  readonly windows: readonly WindowRect[];
  /** Where each open vision's region sits, in stage pixels. */
  readonly regions: readonly RegionRect[];
  readonly setStageElement: (element: HTMLDivElement | null) => void;
  readonly onNodePointerDown: (id: string, event: ReactPointerEvent) => void;
  readonly onStripPointerDown: (id: string, event: ReactPointerEvent) => void;
  readonly onResizePointerDown: (id: string, handle: ResizeHandle, event: ReactPointerEvent) => void;
  readonly onStagePointerDown: (event: ReactPointerEvent) => void;
  readonly onWheel: (event: ReactWheelEvent) => void;
  /** Expands a component into its window. The first time, the view glides
      until the window is centred on the stage, and from below the refit
      floor it zooms to 1:1 as well, since a window opened is a window
      about to be typed into; `reveal: false` leaves the view alone. */
  readonly openWindow: (id: string, reveal?: boolean) => void;
  readonly collapse: (id: string) => void;
  readonly focus: (id: string) => void;
  readonly toggleMaximize: (id: string) => void;
  readonly snapTo: (id: string, side: SnapSide | null) => void;
  readonly openMenu: (target: string | null, at: Point) => void;
  readonly closeMenu: () => void;
  readonly closeRadial: () => void;
  /** Starts drawing a line from `from`; the pointer's end follows the mouse
      until a click lands on a component or Escape, a press on the floor or
      `cancelLink` ends it. Which click completes it is the stage's caller's
      decision, since only it knows what may be joined. */
  readonly startLink: (from: string) => void;
  readonly cancelLink: () => void;
  readonly recenter: () => void;
  readonly fitAll: () => void;
  /** Opens a vision into its region, or closes it to its aperture with the
      sessions alive; both are written to the map (ADR-0067). */
  readonly openVision: (id: string) => void;
  readonly closeVision: (id: string) => void;
  /** Every member open in the shape for the count over the whole stage,
      nothing written; `exitFullscreen` and Escape give back what was. */
  readonly enterFullscreen: (id: string) => void;
  readonly exitFullscreen: () => void;
  readonly fitVision: (id: string) => void;
}

interface Options {
  readonly workspace: Workspace;
  readonly components: readonly Component[];
  /** The visions on the same level (ADR-0067). */
  readonly visions: readonly Vision[];
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

export function useMapStage({ workspace, components, visions, onChange, radialOptions, onClick, onRadialPick }: Options): MapStageApi {
  const [view, setView] = useState<View>(HOME_VIEW);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [snapped, setSnapped] = useState<ReadonlyMap<string, SnapSide>>(new Map());
  const [radial, setRadial] = useState<RadialState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);
  const [resizing, setResizing] = useState<{ id: string; size: { w: number; h: number }; centre: Point } | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapSide | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<string | null>(null);
  /* A window just opened that the view has yet to glide to. */
  const [reveal, setReveal] = useState<string | null>(null);
  /* What was open before a vision filled the screen, to give back on exit. */
  const restoreOpen = useRef<ReadonlySet<string> | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const tracking = useRef<Tracking | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flingFrame = useRef<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const linkingRef = useRef(linking);
  linkingRef.current = linking;
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  const openStateRef = useRef(open);
  openStateRef.current = open;

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

  /* Which vision each component belongs to (ADR-0067). */
  const membership = useMemo<ReadonlyMap<string, Vision>>(() => {
    const map = new Map<string, Vision>();
    for (const vision of visions) for (const id of vision.components) map.set(id, vision);
    return map;
  }, [visions]);
  const componentById = useMemo(() => new Map(components.map((component) => [component.id, component])), [components]);

  /* The free components and the visions share the ring; a member sits in
     its vision's region, laid out from the vision's corner. A vision being
     dragged carries its members, since theirs are measured from it. */
  const laid = useMemo(() => {
    const nodes = [...components.filter((component) => !membership.has(component.id)), ...visions];
    const placed = placeChildren(nodes, centre, ringRadiusFor(stageSize.width, stageSize.height));
    const map = new Map<string, Point>([[HUB, centre]]);
    nodes.forEach((node, i) => {
      const at = placed[i] ?? centre;
      map.set(node.id, dragging === node.id && dragPosition !== null ? dragPosition : at);
    });
    const regionSizes = new Map<string, { readonly w: number; readonly h: number }>();
    for (const vision of visions) {
      if (!vision.open) continue;
      const anchor = map.get(vision.id) ?? centre;
      const members: MemberBox[] = vision.components.flatMap((id) => {
        const component = componentById.get(id);
        if (component === undefined) return [];
        /* A member being dragged keeps its stored place in the layout, so the
           region neither reflows under it nor grows after it: a region that
           followed the pointer could never be dragged out of. */
        /* A maximized member keeps its window's size in the layout too, so
           the region it fills is as large as the window would be. */
        return [{ id, size: open.has(id) ? sizeOf(component) : MEMBER_ICON, pinned: component.position ?? null }];
      });
      const layout = layoutVision(members);
      regionSizes.set(vision.id, layout.size);
      for (const [id, at] of layout.centres) {
        map.set(id, dragging === id && dragPosition !== null ? dragPosition : { x: anchor.x + at.x, y: anchor.y + at.y });
      }
    }
    if (resizing !== null) map.set(resizing.id, resizing.centre);
    return { positions: map as ReadonlyMap<string, Point>, regionSizes: regionSizes as ReadonlyMap<string, { readonly w: number; readonly h: number }> };
  }, [components, componentById, membership, visions, centre, stageSize, dragging, dragPosition, resizing, open, snapped]);
  const positions = laid.positions;

  /* The region of every open vision, in stage pixels, from its corner. */
  const regions = useMemo<readonly RegionRect[]>(() => {
    if (fullscreen !== null) return [];
    const out: RegionRect[] = [];
    for (const vision of visions) {
      const size = laid.regionSizes.get(vision.id);
      const anchor = positions.get(vision.id);
      if (size === undefined || anchor === undefined) continue;
      const corner = toStage(view, anchor);
      const maximized = vision.components.find((id) => open.has(id) && snapped.get(id) === 'full') ?? null;
      out.push({ id: vision.id, left: corner.x, top: corner.y, width: size.w * view.scale, height: size.h * view.scale, maximized });
    }
    return out;
  }, [fullscreen, laid.regionSizes, open, positions, snapped, view, visions]);

  const windows = useMemo<readonly WindowRect[]>(() => {
    const out: WindowRect[] = [];
    /* A vision filling the screen: one cell per member in the shape for the
       count, or the whole floor under the bar for a member maximized there.
       Frames only; the terminals behind them stay where they are (ADR-0014). */
    const filling = fullscreen === null ? undefined : visions.find((vision) => vision.id === fullscreen);
    if (filling !== undefined) {
      const maximized = filling.components.find((id) => snapped.get(id) === 'full');
      if (maximized !== undefined) {
        out.push({
          id: maximized,
          snapped: 'full',
          cell: true,
          left: 0,
          top: FULLSCREEN_BAR,
          width: stageSize.width,
          height: Math.max(0, stageSize.height - FULLSCREEN_BAR),
        });
        return out;
      }
      const frames = fullScreenFrames(filling.components, stageSize, { bar: FULLSCREEN_BAR, gap: FULLSCREEN_GAP });
      /* A member minimized while filling the screen leaves its cell empty
         rather than reflowing the others, which would move what a person
         is typing into. */
      for (const [id, rect] of frames) if (open.has(id)) out.push({ id, snapped: null, cell: true, ...rect });
      out.sort((a, b) => (a.id === focused ? 1 : 0) - (b.id === focused ? 1 : 0));
      return out;
    }
    const regionById = new Map(regions.map((region) => [region.id, region]));
    for (const component of components) {
      if (!open.has(component.id)) continue;
      const vision = membership.get(component.id);
      const side = snapped.get(component.id) ?? null;
      if (vision !== undefined) {
        /* A member of a closed vision is behind the aperture; a sibling of a
           maximized member waits behind it; a maximized member fills the
           region below its bar, a child window in its parent (ADR-0067). */
        const region = regionById.get(vision.id);
        if (region === undefined) continue;
        if (region.maximized !== null && region.maximized !== component.id) continue;
        if (region.maximized === component.id) {
          const bar = REGION.bar * view.scale;
          out.push({
            id: component.id,
            snapped: 'full',
            cell: true,
            left: region.left,
            top: region.top + bar,
            width: region.width,
            height: Math.max(0, region.height - bar),
          });
          continue;
        }
      } else if (side !== null) {
        out.push({ id: component.id, snapped: side, cell: false, ...snapRect(side, stageSize.width, stageSize.height) });
        continue;
      }
      const size = resizing !== null && resizing.id === component.id ? resizing.size : sizeOf(component);
      const at = positions.get(component.id) ?? centre;
      const topLeft = toStage(view, { x: at.x - size.w / 2, y: at.y - size.h / 2 });
      out.push({
        id: component.id,
        snapped: null,
        cell: false,
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
  }, [components, fullscreen, visions, membership, regions, open, snapped, resizing, positions, centre, view, stageSize, focused]);

  /* The vision a map point falls in: an open region's rectangle, or an
     aperture's reach. What a dragged component joins when dropped there. */
  const visionAt = useCallback(
    (mapPoint: Point): string | null => {
      for (const vision of visions) {
        const anchor = positions.get(vision.id);
        if (anchor === undefined) continue;
        if (vision.open) {
          const size = laid.regionSizes.get(vision.id);
          if (size === undefined) continue;
          if (mapPoint.x >= anchor.x && mapPoint.x <= anchor.x + size.w && mapPoint.y >= anchor.y && mapPoint.y <= anchor.y + size.h) {
            return vision.id;
          }
        } else if (Math.hypot(mapPoint.x - anchor.x, mapPoint.y - anchor.y) <= APERTURE_REACH) {
          return vision.id;
        }
      }
      return null;
    },
    [laid.regionSizes, positions, visions],
  );

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

  /* Captured on the element pressed, never on the stage (#363). The window
     listeners below do the tracking either way; what capture decides is
     where the browser sends the `click` and `dblclick` that follow the
     release, which is the common ancestor of the press target and the
     capturing element. Captured on the stage, a strip's double-click landed
     on the stage and fitted the view. jsdom has no pointer capture; an
     element without it still tracks, only less politely. */
  const capture = useCallback((event: ReactPointerEvent): void => {
    const element = event.currentTarget as Element | null | undefined;
    if (typeof element?.setPointerCapture === 'function') element.setPointerCapture(event.pointerId);
  }, []);

  const focus = useCallback((id: string): void => setFocused(id), []);

  /* Glides the view to `target` over the normal duration, easing out, or
     cuts to it under reduced motion. Shares the fling's frame handle, so a
     press stops it and the teardown cancels it. */
  const glideTo = useCallback(
    (target: View): void => {
      stopFling();
      const from = viewRef.current;
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || typeof requestAnimationFrame !== 'function') {
        setView(target);
        return;
      }
      const started = performance.now();
      const step = (): void => {
        const t = Math.min(1, (performance.now() - started) / REVEAL_MS);
        const eased = 1 - (1 - t) * (1 - t);
        setView({
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased,
          scale: from.scale + (target.scale - from.scale) * eased,
        });
        flingFrame.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      flingFrame.current = requestAnimationFrame(step);
    },
    [stopFling],
  );

  const openWindow = useCallback((id: string, reveal: boolean = true): void => {
    const first = !openStateRef.current.has(id);
    setOpen((current) => (current.has(id) ? current : new Set([...current, id])));
    setFocused(id);
    /* Centre on the first open only: a click on a window already open is
       focus, not a request to move the map under the others. Filling the
       screen has no map to move. */
    if (reveal && first && fullscreenRef.current === null) setReveal(id);
  }, []);

  /* The glide waits for the render that opened the window, since a member
     of a vision moves when its cell grows from an icon to a window: the
     centre to reach is the one the layout settles on, not the icon's. */
  useEffect(() => {
    if (reveal === null) return;
    setReveal(null);
    const at = positions.get(reveal);
    if (at === undefined) return;
    const scale = viewRef.current.scale < REFIT_MIN ? 1 : viewRef.current.scale;
    glideTo({ x: centre.x - at.x * scale, y: centre.y - at.y * scale, scale });
  }, [centre, glideTo, positions, reveal]);

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

  const cancelLink = useCallback((): void => setLinking(null), []);
  const startLink = useCallback(
    (from: string): void => {
      setMenu(null);
      setRadial(null);
      const at = positions.get(from) ?? centre;
      setLinking({ from, pointer: toStage(viewRef.current, at) });
    },
    [centre, positions],
  );

  /* Escape ends a line being drawn. Listened for only while one is, and
     removed with it, so the map never holds a key listener it has no use
     for; `tests/map-stage-teardown.test.ts` holds that. */
  useEffect(() => {
    if (linking === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLinking(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking]);
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
      /* A cell is the shape's, not the pointer's (ADR-0067). */
      if (snapped.has(id) || fullscreenRef.current !== null) return;
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
      if (component === undefined || snapped.has(id) || fullscreenRef.current !== null) return;
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
      /* A press on the floor while a line is being drawn ends the line and
         nothing else: it is the way out that needs no key. */
      if (linkingRef.current !== null) {
        setLinking(null);
        return;
      }
      const at = stagePoint(event);
      tracking.current = { kind: 'pan', last: at, velocity: { x: 0, y: 0 }, at: performance.now() };
      capture(event);
    },
    [capture, stagePoint, stopFling],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      if (linkingRef.current !== null) {
        const pointer = stagePoint(event);
        setLinking((state) => (state === null ? null : { ...state, pointer }));
      }
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
            const dropAt = { x: mapAt.x + current.offset.x, y: mapAt.y + current.offset.y };
            setDragging(current.element);
            setDragPosition(dropAt);
            const isVision = visionsRef.current.some((vision) => vision.id === current.element);
            setDropTarget(isVision ? null : visionAt(dropAt));
            setSnapPreview(isVision || membershipRef.current.has(current.element) ? null : snapZone(at, stageSize.width));
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
            setDropTarget(null);
            const mapAt = toMap(viewRef.current, at);
            const dropAt = { x: Math.round(mapAt.x + current.offset.x), y: Math.round(mapAt.y + current.offset.y) };
            const workspace = workspaceRef.current;
            if (visionsRef.current.some((vision) => vision.id === current.element)) {
              onChange(moveVision(workspace, current.element, dropAt));
              return;
            }
            /* ADR-0067: dropped in a vision, the component joins it, pinned
               where it landed; dropped outside its own, it leaves. A member
               never snaps to the stage's edges, since its window is its
               vision's to place. */
            const was = membershipRef.current.get(current.element);
            const into = visionAt(dropAt);
            if (into !== null) {
              const target = visionsRef.current.find((vision) => vision.id === into);
              const anchor = positionsRef.current.get(into);
              if (target === undefined || anchor === undefined) return;
              /* The vision's corner is written first when the map placed it,
                 so the pin is measured from a place the file knows. */
              const anchored = target.position === undefined ? moveVision(workspace, into, { x: Math.round(anchor.x), y: Math.round(anchor.y) }) : workspace;
              const pin = { x: dropAt.x - Math.round(anchor.x), y: dropAt.y - Math.round(anchor.y) };
              /* Joining a closed vision, the member flows: a pin measured
                 from an aperture would be a place in a region not yet open. */
              onChange(
                was?.id === into
                  ? moveComponent(anchored, current.element, pin)
                  : addMember(anchored, into, current.element, target.open ? dropAt : undefined),
              );
              return;
            }
            if (was !== undefined) {
              onChange(removeMember(workspace, current.element, dropAt));
              return;
            }
            if (side !== null && open.has(current.element)) {
              snapTo(current.element, side);
              return;
            }
            onChange(moveComponent(workspace, current.element, dropAt));
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
    };
  }, [clearHold, onChange, onClick, onRadialPick, open, snapTo, stagePoint, stageSize.width, visionAt]);

  /* A frame in flight, a fling or a glide, is cancelled when the stage goes
     away, and only then: this effect re-registers the listeners above
     whenever a window opens, which is the very moment a glide starts, so
     cancelling in that cleanup would end every glide on its first frame. */
  useEffect(() => () => stopFling(), [stopFling]);

  const visionsRef = useRef(visions);
  visionsRef.current = visions;
  const membershipRef = useRef(membership);
  membershipRef.current = membership;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const openVision = useCallback(
    (id: string): void => {
      onChange(setVisionOpen(workspaceRef.current, id, true));
      setFocused(id);
    },
    [onChange],
  );
  const closeVision = useCallback(
    (id: string): void => {
      onChange(setVisionOpen(workspaceRef.current, id, false));
      setFocused((current) => (current === id ? null : current));
    },
    [onChange],
  );

  const enterFullscreen = useCallback(
    (id: string): void => {
      const vision = visionsRef.current.find((one) => one.id === id);
      if (vision === undefined) return;
      stopFling();
      setMenu(null);
      setRadial(null);
      setLinking(null);
      setOpen((current) => {
        if (restoreOpen.current === null) restoreOpen.current = current;
        return new Set([...current, ...vision.components]);
      });
      setSnapped((current) => {
        const next = new Map(current);
        for (const member of vision.components) next.delete(member);
        return next;
      });
      setFullscreen(id);
      setFocused(vision.components[0] ?? null);
    },
    [stopFling],
  );
  const exitFullscreen = useCallback((): void => {
    setFullscreen((current) => {
      if (current === null) return current;
      const vision = visionsRef.current.find((one) => one.id === current);
      const was = restoreOpen.current;
      restoreOpen.current = null;
      if (was !== null) setOpen(was);
      setSnapped((state) => {
        if (vision === undefined) return state;
        const next = new Map(state);
        for (const member of vision.components) next.delete(member);
        return next;
      });
      return null;
    });
  }, []);

  /* Escape leaves a vision filling the screen. Listened for only while one
     is, and removed with it, the way the line's is (ADR-0065);
     `tests/map-stage-teardown.test.ts` holds that. */
  useEffect(() => {
    if (fullscreen === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') exitFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitFullscreen, fullscreen]);

  /* A vision that left the map while filling the screen leaves the mode
     with it, rather than a bar naming nothing. */
  useEffect(() => {
    if (fullscreen !== null && !visions.some((vision) => vision.id === fullscreen)) exitFullscreen();
  }, [exitFullscreen, fullscreen, visions]);

  const fitVision = useCallback(
    (id: string): void => {
      stopFling();
      const anchor = positions.get(id);
      const size = laid.regionSizes.get(id);
      if (anchor === undefined) return;
      const rect: Rect =
        size === undefined
          ? { left: anchor.x - MEMBER_ICON.w / 2, top: anchor.y - MEMBER_ICON.h / 2, right: anchor.x + MEMBER_ICON.w / 2, bottom: anchor.y + MEMBER_ICON.h / 2 }
          : { left: anchor.x, top: anchor.y, right: anchor.x + size.w, bottom: anchor.y + size.h };
      setView(fitTo(rect, stageSize.width, stageSize.height));
    },
    [laid.regionSizes, positions, stageSize, stopFling],
  );

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
    if (components.length === 0 && visions.length === 0) {
      setView(HOME_VIEW);
      return;
    }
    let rect: Rect | null = null;
    const boxes: Rect[] = [];
    for (const component of components) {
      const at = positions.get(component.id);
      if (at === undefined) continue;
      const half = open.has(component.id) ? { x: sizeOf(component).w / 2, y: sizeOf(component).h / 2 } : { x: 52, y: 62 };
      boxes.push({ left: at.x - half.x, top: at.y - half.y, right: at.x + half.x, bottom: at.y + half.y });
    }
    for (const vision of visions) {
      const at = positions.get(vision.id);
      if (at === undefined) continue;
      const size = laid.regionSizes.get(vision.id);
      boxes.push(
        size === undefined
          ? { left: at.x - 52, top: at.y - 62, right: at.x + 52, bottom: at.y + 62 }
          : { left: at.x, top: at.y, right: at.x + size.w, bottom: at.y + size.h },
      );
    }
    for (const box of boxes) {
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
  }, [components, visions, laid.regionSizes, open, positions, stageSize, stopFling]);

  return {
    view: { ...view, scale: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.scale)) },
    stageSize,
    open,
    focused,
    snapped,
    radial,
    menu,
    linking,
    dragging,
    snapPreview,
    dropTarget,
    fullscreen,
    positions,
    windows,
    regions,
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
    startLink,
    cancelLink,
    recenter,
    fitAll,
    openVision,
    closeVision,
    enterFullscreen,
    exitFullscreen,
    fitVision,
  };
}
