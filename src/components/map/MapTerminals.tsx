import type { JSX } from 'react';

import type { Point, Session } from '../../ipc';
import type { MountedTerminal } from '../../features/terminal';
import type { ClipboardApi, TerminalSize } from '../../features/terminal/use-terminal';

import { TerminalView } from '../TerminalView';

import type { TerminalFrame } from './MapStage';

/** What the shell wires into every terminal, whichever workspace mounts it. */
export interface TerminalWiring {
  readonly sessions: readonly Session[];
  readonly modifier: 'meta' | 'control';
  readonly onSize: (size: TerminalSize | null) => void;
  readonly onFocusHandle: (sessionId: string, focus: () => void) => void;
  readonly onPasteNeedsConfirming: (sessionId: string, text: string) => void;
  readonly onInput: (sessionId: string, bytes: Uint8Array) => void;
}

interface MapTerminalsProps extends TerminalWiring {
  /** One per SSH component whose host is connected (`mapTerminals`). */
  readonly mounted: readonly MountedTerminal[];
  /** Where the open ones go. A mounted terminal with no frame is collapsed:
      it keeps the whole area, hidden, the way a background tab does in
      Sessions, so `FitAddon` goes on measuring something real (ADR-0014). */
  readonly frames: readonly TerminalFrame[];
  /** A press inside a terminal raises its component's window. */
  readonly onPress: (componentId: string) => void;
  /** The right button inside a terminal: the window's own menu, at a point
      in stage pixels (#115). */
  readonly onContextMenu: (componentId: string, at: Point) => void;
  /** Each terminal's clipboard, keyed by session, for that menu. */
  readonly onClipboardHandle: (sessionId: string, clipboard: ClipboardApi) => void;
}

/**
 * The map's terminal stack.
 *
 * The second of exactly two places a `TerminalView` is mounted, the other
 * being Sessions' own stack in `App.tsx`; `tests/no-terminal-in-home.test.ts`
 * holds that count. It renders inside the map's `<main>`, which exists only
 * while the map is the workspace showing, so nothing here can draw remote
 * output over Home (ADR-0032).
 */
export function MapTerminals({
  mounted,
  frames,
  onPress,
  onContextMenu,
  onClipboardHandle,
  sessions,
  modifier,
  onSize,
  onFocusHandle,
  onPasteNeedsConfirming,
  onInput,
}: MapTerminalsProps): JSX.Element {
  return (
    <>
      {mounted.map((terminal) => {
        const frame = frames.find((one) => one.sessionId === terminal.sessionId);
        const shown = frame !== undefined && frame.visible;
        return (
          /* The terminals paint above the windows, outside them in the tree,
             so a press inside one would otherwise reach the stage and start
             a pan under the text being selected. `display: contents` keeps
             the wrapper out of layout; the events still bubble through it. */
          <div
            key={terminal.sessionId}
            style={{ display: 'contents' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (frame !== undefined) onPress(frame.componentId);
            }}
          >
            <TerminalView
              handle={terminal.handle}
              session={sessions.find((one) => one.id === terminal.sessionId) ?? null}
              sessions={sessions}
              visible={shown}
              focused={frame?.focused ?? false}
              frame={
                frame !== undefined && shown
                  ? { ...frame.style, zIndex: frame.zIndex }
                  : { left: 0, top: 0, width: '100%', height: '100%' }
              }
              id={`map-terminal-${terminal.sessionId}`}
              labelledBy={frame?.bodyId ?? `map-terminal-${terminal.sessionId}`}
              onPaneFocus={() => {}}
              onSize={onSize}
              onFocusHandle={(focus) => onFocusHandle(terminal.sessionId, focus)}
              modifier={modifier}
              onPasteNeedsConfirming={(text) => onPasteNeedsConfirming(terminal.sessionId, text)}
              onInput={(bytes) => onInput(terminal.sessionId, bytes)}
              broadcasting={false}
              onClipboardHandle={(clipboard) => onClipboardHandle(terminal.sessionId, clipboard)}
              onContextMenu={(event) => {
                if (frame === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = (event.currentTarget as HTMLElement).closest('[data-map-stage]')?.getBoundingClientRect();
                onContextMenu(frame.componentId, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
              }}
            />
          </div>
        );
      })}
    </>
  );
}
