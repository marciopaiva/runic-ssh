/**
 * Which bastions Home's own host list keeps folded, surviving closing the
 * application (ADR-0060). `localStorage`, not the settings file
 * `persistTheme`/`persistLocale` already use: this is a scroll position for
 * one view, not an application-wide choice, closer to `sidebarOpen` in
 * `App.tsx` (which does not persist at all) than to a theme. The first use
 * of `localStorage` anywhere in this frontend; nothing secret goes into it,
 * an id per bastion, the one rule CLAUDE.md section 6 places on it.
 */

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'runic-ssh.home.collapsedBastions';

function readStored(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeStored(collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* Best-effort: a full or unavailable store loses only this view's own
       memory of what was folded, never anything the app needs to function. */
  }
}

export function useCollapsedBastions(): {
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (id: string) => void;
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => readStored());

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored(next);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
