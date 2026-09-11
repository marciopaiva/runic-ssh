import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { Component, Session } from '../../ipc';
import { RESIZE_HANDLES, resizeCursor } from '../../features/map';
import type { ResizeHandle, SnapSide } from '../../features/map';
import { useTranslator } from '../../features/settings';

import { BroadcastGlyph } from '../BroadcastGlyph';

import { kindColor } from './glyphs';

interface ComponentWindowProps {
  readonly component: Component;
  /** `null` for this machine, which has no host to edit (ADR-0065). */
  readonly host: Session | null;
  /** In stage pixels: the window is drawn in screen space, not in the
      scaled world, so what is inside it stays 1:1 whatever the zoom. */
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly snapped: SnapSide | null;
  readonly focused: boolean;
  readonly connected: boolean;
  /** Whether the body is drawn at all. Below the measured floor the window
      is a thumbnail and its body is left empty (ADR-0064's follow-up). */
  readonly thumbnail: boolean;
  /** On an armed line: receiving what is typed elsewhere on it, spared by
      its own switch, or armed but reaching nobody yet because one receiving
      window is no broadcast. `null` off any armed line, when the strip
      shows no switch at all (ADR-0065, ADR-0019's per-pane opt-out). */
  readonly broadcast: 'receiving' | 'muted' | 'armed' | null;
  readonly onToggleMute: () => void;
  /** On a file browser with a line to somewhere: how many entries are
      selected, and the send. `null` on every other window (ADR-0065). */
  readonly send: { readonly count: number; readonly onSend: () => void } | null;
  readonly children: ReactNode;
  readonly onStripPointerDown: (event: ReactPointerEvent) => void;
  readonly onResizePointerDown: (handle: ResizeHandle, event: ReactPointerEvent) => void;
  readonly onFocus: () => void;
  readonly onMinimize: () => void;
  readonly onToggleMaximize: () => void;
  readonly onClose: () => void;
  readonly onEditHost: () => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  /** The body's own element id, for the terminal frame to be aimed at. */
  readonly bodyId: string;
}

const HANDLE_CLASS: Readonly<Record<ResizeHandle, string>> = {
  n: 'top-[-4px] left-2 right-2 h-2',
  s: 'bottom-[-4px] left-2 right-2 h-2',
  e: 'right-[-4px] top-2 bottom-2 w-2',
  w: 'left-[-4px] top-2 bottom-2 w-2',
  ne: 'top-[-4px] right-[-4px] h-3 w-3',
  nw: 'top-[-4px] left-[-4px] h-3 w-3',
  se: 'bottom-[-4px] right-[-4px] h-3 w-3',
  sw: 'bottom-[-4px] left-[-4px] h-3 w-3',
};

/**
 * An open component: its window, in place of its icon.
 *
 * The strip carries the state dot, the host's name (a button: it opens the
 * host editor), `user@host`, the kind tag, and the three buttons a window
 * has on Windows. Every edge resizes and there is no corner mark, which is
 * also how Windows does it. The body is whatever the kind puts there; for a
 * terminal it is an empty area the shell aims a mounted `TerminalView` at,
 * because a terminal that changed parent would be remounted (ADR-0014).
 */
export function ComponentWindow({
  component,
  host,
  rect,
  snapped,
  focused,
  connected,
  thumbnail,
  broadcast,
  onToggleMute,
  send,
  children,
  onStripPointerDown,
  onResizePointerDown,
  onFocus,
  onMinimize,
  onToggleMaximize,
  onClose,
  onEditHost,
  onContextMenu,
  bodyId,
}: ComponentWindowProps): JSX.Element {
  const i18n = useTranslator();
  const name = host === null ? i18n.t('map.local.name') : host.name;
  const who = host === null ? i18n.t('sftp.localhost') : `${host.user}@${host.host}${host.port === 22 ? '' : `:${String(host.port)}`}`;
  const maximized = snapped === 'full';
  /* The receiving edge outranks the focus edge, as it does on a pane in
     Sessions (ADR-0019): with typing synchronised every receiving window
     carries the warning, and focus is the status bar's to say. */
  const edge =
    broadcast === 'receiving' ? 'border-warn' : focused ? 'border-accent' : 'border-line-strong';
  return (
    <section
      data-window={component.id}
      aria-label={name}
      className={`absolute flex flex-col overflow-hidden border transition-[box-shadow,border-color] duration-normal ${
        maximized ? 'rounded-none' : 'rounded-[7px]'
      } ${edge} ${focused ? 'shadow-5' : 'shadow-3'}`}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        background: 'var(--rs-glass-fill)',
        backdropFilter: 'blur(var(--rs-glass-blur))',
        WebkitBackdropFilter: 'blur(var(--rs-glass-blur))',
        boxShadow: focused ? 'inset 0 1px 0 var(--rs-glass-top), var(--rs-shadow-5)' : 'inset 0 1px 0 var(--rs-glass-top), var(--rs-shadow-3)',
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onFocus();
      }}
      onContextMenu={onContextMenu}
    >
      <div
        className={`border-line-subtle flex h-7 shrink-0 items-center gap-2 border-b pr-1 pl-2.5 ${
          snapped === null ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ background: 'var(--rs-glass-tint)' }}
        onPointerDown={onStripPointerDown}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button') === null) onToggleMaximize();
        }}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? 'bg-ok' : 'border-ink-faint border'}`}
          aria-hidden="true"
        />
        {/* The address gives way first, down to nothing, and only then the
            name, capped at half the strip: below 75% the terminal is a
            thumbnail and the name is the one thing a person reads in the
            strip (#364). A flex item's minimum width is its content unless
            told otherwise, which is what wrapped the name onto two lines. */}
        {host === null ? (
          <span className="text-ink max-w-[50%] shrink-0 truncate text-[12px] font-semibold">{name}</span>
        ) : (
          <button
            type="button"
            className="text-ink hover:bg-surface-raised -mx-1 max-w-[50%] shrink-0 truncate rounded px-1 text-[12px] font-semibold hover:underline hover:underline-offset-2"
            title={i18n.t('map.window.editHost')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onEditHost}
          >
            {name}
          </button>
        )}
        <span className="text-ink-faint min-w-0 truncate font-mono text-[10.5px]">{who}</span>
        {broadcast !== null && (
          <button
            type="button"
            role="switch"
            aria-checked={broadcast !== 'muted'}
            title={i18n.t(broadcast === 'muted' ? 'map.window.unmute' : 'map.window.mute')}
            aria-label={i18n.t(broadcast === 'muted' ? 'map.window.unmute' : 'map.window.mute')}
            className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded ${
              broadcast === 'receiving'
                ? 'text-warn hover:bg-warn-soft'
                : 'text-ink-muted hover:bg-surface-raised'
            }`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggleMute}
          >
            <BroadcastGlyph className="h-3.5 w-3.5" struck={broadcast === 'muted'} />
          </button>
        )}
        {send !== null && (
          <button
            type="button"
            title={i18n.t(send.count === 0 ? 'map.window.send.none' : 'map.window.send')}
            aria-label={i18n.t('map.window.send')}
            disabled={send.count === 0}
            className={`relative ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded ${
              send.count === 0 ? 'text-ink-faint' : 'text-warn hover:bg-warn-soft'
            }`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={send.onSend}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            {send.count > 0 && (
              <span className="bg-surface-base text-warn border-warn absolute -top-1.5 -right-2 rounded-full border px-1 font-mono text-[9px] leading-[12px] font-bold">
                {send.count}
              </span>
            )}
          </button>
        )}
        <span
          className={`${broadcast === null && send === null ? 'ml-auto' : ''} text-[10.5px] font-bold tracking-[0.08em]`}
          style={{ color: kindColor(component.kind) }}
        >
          {component.kind.toUpperCase()}
        </span>
        <span className="flex items-center gap-0.5" onPointerDown={(event) => event.stopPropagation()}>
          <WindowButton label={i18n.t('map.window.minimize')} onClick={onMinimize}>
            &ndash;
          </WindowButton>
          <WindowButton label={i18n.t(maximized ? 'map.window.restore' : 'map.window.maximize')} onClick={onToggleMaximize}>
            {maximized ? '❐' : '□'}
          </WindowButton>
          <WindowButton label={i18n.t('map.window.close')} onClick={onClose} danger>
            &#10005;
          </WindowButton>
        </span>
      </div>
      <div id={bodyId} className="bg-surface-terminal relative min-h-0 flex-1 select-text" data-map-scrolls="">
        {thumbnail ? null : children}
      </div>
      {snapped === null &&
        RESIZE_HANDLES.map((handle) => (
          <div
            key={handle}
            className={`absolute z-10 ${HANDLE_CLASS[handle]}`}
            style={{ cursor: resizeCursor(handle) }}
            onPointerDown={(event) => onResizePointerDown(handle, event)}
          />
        ))}
    </section>
  );
}

function WindowButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly danger?: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`text-ink-muted flex h-6 w-[26px] items-center justify-center rounded text-[11px] ${
        danger ? 'hover:bg-danger-soft hover:text-danger-text' : 'hover:bg-surface-raised hover:text-ink'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
