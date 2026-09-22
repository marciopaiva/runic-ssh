import type { JSX } from 'react';

import type { WindowAction, WindowControl } from '../features/chrome';
import { useTranslator } from '../features/settings';

import { LogoMark } from './LogoMark';
import { WindowControls } from './WindowControls';
import { cn } from '../lib/classnames';

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
 * ADR-0021 put the shape control here for a while, at the trailing edge, and
 * the switch for typing into every rectangle followed it for a day before
 * settling on each group's own strip. ADR-0046 moved the shape control out
 * again, into a toolbar row of its own beneath this bar, once SFTP needed a
 * home for its own split control and this bar turned out to be the wrong
 * place to ask a second workspace to share. What is left here is 36px of
 * mark, drag surface and window controls, same as ADR-0020 first drew it.
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
      className={cn(
        'bg-surface-chrome border-line-subtle flex h-9 shrink-0 items-stretch border-b',
        'transition-colors duration-fast easing-standard',
      )}
      style={{ paddingLeft: `${leadingInset}px` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-3.5">
        <LogoMark
          className="h-[18px] w-[18px] shrink-0"
          strokeWidth={1.4}
          aria-hidden={false}
          role="img"
          aria-label={i18n.t('app.name')}
        />

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