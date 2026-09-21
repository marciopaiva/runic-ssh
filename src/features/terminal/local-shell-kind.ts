/**
 * Turning a `LocalShellKind` into what a person sees.
 *
 * The IPC boundary carries no display text (CLAUDE.md section 1 keeps
 * user-facing strings out of every file but `src/locales/`), so this is
 * where a bare `{ kind: 'wsl', distro: 'Ubuntu' }` becomes a translated tab
 * title or palette entry. One place, used by both the "+" palette
 * (`localShellCommands`) and the tab strip (`entryTitle`), so the two never
 * drift apart on what a shell is called.
 */

import type { LocalShellKind } from '../../ipc';
import type { Translator } from '../../lib/i18n';

/**
 * One open local shell tab (ADR-0074).
 *
 * `sessionId` is the client-minted id its `Focus` of kind `'local'` carries,
 * not the numeric id `open_local_shell` hands back: that one is minted only
 * once the pty exists, and `LocalShellView` mints it lazily on mount. Kept
 * here rather than in `App.tsx` alone so `GroupStrip`'s `entryTitle` can name
 * a local shell's tab without importing from the shell that owns the list.
 */
export interface LocalShellTab {
  readonly sessionId: string;
  readonly kind: LocalShellKind;
}

/** Stable across renders, for a `Command`'s `id` and a React `key`. */
export function localShellKindId(kind: LocalShellKind): string {
  return kind.kind === 'wsl' ? `wsl:${kind.distro}` : kind.kind;
}

export function localShellLabel(kind: LocalShellKind, i18n: Translator): string {
  switch (kind.kind) {
    case 'powerShell':
      return i18n.t('local.shell.powerShell');
    case 'cmd':
      return i18n.t('local.shell.cmd');
    case 'wsl':
      return i18n.t('local.shell.wsl', { distro: kind.distro });
    case 'defaultShell':
      return i18n.t('local.shell.defaultShell');
  }
}
