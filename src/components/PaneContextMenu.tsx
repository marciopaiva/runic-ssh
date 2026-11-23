import { useEffect } from 'react';
import type { JSX } from 'react';

import { terminalMenu } from '../features/terminal/menu';
import { isLinux } from '../lib/platform';
import { useTranslator } from '../features/settings';
import type { ClipboardApi } from '../features/terminal/use-terminal';

import { ContextMenu } from './ContextMenu';

interface PaneContextMenuProps {
  /** Where the pointer was, in window coordinates. */
  readonly at: { readonly x: number; readonly y: number };
  readonly clipboard: ClipboardApi | null;
  readonly modifier: 'meta' | 'control';
  readonly onClose: () => void;
}

/**
 * The right button over a terminal pane in Sessions (#460): Copy and Paste,
 * each with the key that does the same, in place of the webview's own menu
 * (a greyed Copy, and on some platforms Reload; see `chrome/context-menu.ts`).
 *
 * Broadcast and sparing a pane already have their own controls in this
 * workspace's bar, so the menu stays at copy and paste.
 */
export function PaneContextMenu({ at, clipboard, modifier, onClose }: PaneContextMenuProps): JSX.Element {
  const i18n = useTranslator();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    /* Captured, because xterm holds the keyboard while its pane is focused and
       stops the key before a bubbling listener would see it. */
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const shortcut = (key: string): string =>
    i18n.t(modifier === 'meta' ? 'terminal.menu.shortcut.meta' : 'terminal.menu.shortcut.control', { key });

  const entries = terminalMenu({
    hasSelection: clipboard?.hasSelection() ?? false,
    pasteAllowed: !isLinux(navigator.userAgent),
  });

  const items = entries.map((entry) =>
    entry.id === 'copy'
      ? { id: 'copy', label: i18n.t('terminal.menu.copy'), detail: shortcut('C'), disabled: entry.disabled }
      : { id: 'paste', label: i18n.t('terminal.menu.paste'), detail: shortcut('V'), disabled: entry.disabled },
  );

  return (
    /* The menu positions itself absolutely; this gives it the whole window as
       its frame and lets everything outside it through. */
    <div className="pointer-events-none fixed inset-0 z-[320] [&>*]:pointer-events-auto">
      <ContextMenu
        at={at}
        title={i18n.t('terminal.menu.title')}
        items={items}
        onPick={(id) => {
          if (id === 'copy') clipboard?.copy();
          if (id === 'paste') clipboard?.paste();
          onClose();
        }}
        onClose={onClose}
      />
    </div>
  );
}
