import { useEffect, useState } from 'react';
import type { CSSProperties, JSX, MouseEvent as ReactMouseEvent } from 'react';

import type { LocalShellKind } from '../ipc';
import { useLocalShellTerminal } from '../features/terminal';
import type { ClipboardApi, TerminalSize } from '../features/terminal/use-terminal';
import { useTranslator } from '../features/settings';

import { Card } from './ui/Card';

export interface LocalShellViewProps {
  readonly kind: LocalShellKind;
  /** Whether this shell is the active tab of a group. */
  readonly visible: boolean;
  /** Whether this is the pane the keyboard and the status bar belong to. */
  readonly focused: boolean;
  /** Where to draw, decided by the shell. Same reasoning as `TerminalView`'s
      own `frame`: a percentage of the main area, never a class. */
  readonly frame: CSSProperties;
  /** This surface's own id, which its tab points `aria-controls` at. */
  readonly id: string;
  /** The tab that names it. */
  readonly labelledBy: string;
  /** Raised when the pointer or the keyboard lands inside this pane. */
  readonly onPaneFocus: () => void;
  /** Reports the grid the pty was last told about. */
  readonly onSize: (size: TerminalSize | null) => void;
  /** Reports this pane's own focus function. */
  readonly onFocusHandle: (focus: () => void) => void;
  /** Which key means the clipboard on this platform. */
  readonly modifier: 'meta' | 'control';
  /** Raised for a paste the shell would run a line at a time. */
  readonly onPasteNeedsConfirming: (text: string) => void;
  /** Reports the clipboard, for a menu drawn by whoever mounts this. */
  readonly onClipboardHandle?: ((clipboard: ClipboardApi) => void) | undefined;
  readonly onContextMenu?: ((event: ReactMouseEvent) => void) | undefined;
}

/**
 * A local shell's own terminal surface.
 *
 * `TerminalView`'s sibling, not a parametrization of it: `useLocalShellTerminal`
 * has its own opening order (see that hook's own doc comment) and never takes
 * an `onInput` or `broadcasting` prop, since a local shell is never a
 * broadcast target (ADR-0074). There is no facet bar above this one either:
 * a local shell has no tunnels and no saved session to show a monitor for, so
 * unlike `SessionBody` there is nothing this component would wrap.
 */
export function LocalShellView({
  kind,
  visible,
  focused,
  frame,
  id,
  labelledBy,
  onPaneFocus,
  onSize,
  onFocusHandle,
  modifier,
  onPasteNeedsConfirming,
  onClipboardHandle,
  onContextMenu,
}: LocalShellViewProps): JSX.Element {
  const i18n = useTranslator();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { closed, exitStatus, size, focus, clipboard } = useLocalShellTerminal(
    container,
    kind,
    modifier,
    onPasteNeedsConfirming,
    () => {},
  );

  useEffect(() => {
    if (focused) onSize(size);
  }, [onSize, size, focused]);

  useEffect(() => {
    onFocusHandle(focus);
  }, [onFocusHandle, focus]);

  useEffect(() => {
    onClipboardHandle?.(clipboard);
  }, [onClipboardHandle, clipboard]);

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={`bg-surface-terminal absolute flex flex-col overflow-hidden ${
        visible ? '' : 'invisible pointer-events-none'
      }`}
      style={frame}
      aria-hidden={visible ? undefined : true}
      onFocus={onPaneFocus}
      onContextMenu={onContextMenu}
    >
      <div className="min-h-0 flex-1 p-2">
        <div ref={setContainer} className="h-full w-full" />
      </div>

      {closed && (
        <Card variant="filled" padding="sm" className="border-t border-line-subtle">
          <p className="text-ink-muted border-line-subtle border-t px-3 py-1.5 font-mono text-xs">
            {exitStatus === null
              ? i18n.t('terminal.endedUnknown')
              : i18n.t('terminal.ended', { status: String(exitStatus) })}
          </p>
        </Card>
      )}
    </section>
  );
}
