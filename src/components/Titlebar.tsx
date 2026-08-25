import type { JSX } from 'react';

import type { WindowAction, WindowControl } from '../features/chrome';
import { useTranslator } from '../features/settings';

import { WindowControls } from './WindowControls';

interface TitlebarProps {
  readonly controls: readonly WindowControl[];
  /** Space to keep clear at the leading edge for controls the system draws. */
  readonly leadingInset: number;
  readonly onAct: (action: WindowAction) => void;
}

/**
 * The window's own titlebar.
 *
 * ADR-0005: the window is undecorated on Windows and Linux, and on macOS the
 * native traffic lights float over this bar with `leadingInset` reserved for
 * them. Everything the OS used to do up here is now ours — dragging the window
 * is `data-tauri-drag-region`, double-click to maximise comes with it, and the
 * buttons at the trailing edge are drawn by us or by nobody.
 *
 * ADR-0020 took the tabs out of it. They live in the groups now, where the
 * strip naming a rectangle and the rectangle itself are one object. What is
 * left is 36px of mark, drag surface and window controls, which is 4px less
 * than the bar it replaces: the rail below is paid for in width and not in
 * height.
 *
 * `deep` on the drag region means a drag starting anywhere on the bar moves
 * the window, *except* on a button: Tauri's handler stops at the first
 * clickable element it walks through.
 */
export function Titlebar({ controls, leadingInset, onAct }: TitlebarProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <header
      data-tauri-drag-region="deep"
      className="bg-surface-chrome border-line-subtle flex h-9 shrink-0 items-stretch border-b"
      style={{ paddingLeft: `${leadingInset}px` }}
    >
      <div
        /* The mark sits in a cell the width of the rail below it, and the rule
           down its trailing edge is that rail's rule continued. On macOS the
           inset pushes the cell off the rail (ADR-0020 accepts that), so the
           rule is dropped rather than drawn somewhere it lines up with
           nothing. */
        className={`flex w-12 shrink-0 items-center justify-center ${
          leadingInset === 0 ? 'border-line-subtle border-r' : ''
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          role="img"
          aria-label={i18n.t('app.name')}
        >
          <circle cx="9.5" cy="12" r="7" className="stroke-brand-start" strokeWidth="1.4" />
          <circle cx="14.5" cy="12" r="7" className="stroke-brand-end" strokeWidth="1.4" />
          <path
            d="M12 6.5v11M12 10l3-2.5M12 14l3 2.5M12 12l-2.6-2.2"
            className="stroke-brand-rune"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* The rest of the bar is drag surface, and the reason the controls sit
          flush against the trailing edge. */}
      <div className="flex min-w-0 flex-1 items-center pl-3.5">
        <span
          aria-hidden="true"
          className="text-ink-faint text-[11.5px] font-bold tracking-[0.13em] uppercase"
        >
          {i18n.t('app.name')}
        </span>
      </div>

      <WindowControls controls={controls} onAct={onAct} />
    </header>
  );
}
