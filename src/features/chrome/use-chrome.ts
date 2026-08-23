/**
 * What the titlebar needs to know about the window.
 *
 * State and effects live here rather than in the component, per section 6.
 * Until the core answers, `chrome` is `null` and the titlebar draws the bar
 * without its contents — the bar is the same height either way, so nothing
 * below it moves when the answer arrives.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  asIpcError,
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
  windowChrome,
} from '../../ipc';
import type { WindowChrome } from '../../ipc';

import type { WindowAction } from './controls';

interface ChromeState {
  /** `null` until the core has answered. */
  readonly chrome: WindowChrome | null;
  readonly maximized: boolean;
  readonly act: (action: WindowAction) => void;
  /** Set when a window control could not do what it was asked. */
  readonly refused: string | null;
}

export function useChrome(): ChromeState {
  const [chrome, setChrome] = useState<WindowChrome | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let live = true;

    void windowChrome().then((answer) => {
      if (live) setChrome(answer);
    });

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    let stop: (() => void) | null = null;

    const refresh = (): void => {
      void isWindowMaximized().then((now) => {
        if (live) setMaximized(now);
      });
    };

    refresh();

    /* There is no maximise event. A resize is the signal, and asking the
       window afterwards is the only answer that survives the user dragging
       the window off a snap. */
    void onWindowResized(refresh).then((unlisten) => {
      if (live) {
        stop = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      live = false;
      stop?.();
    };
  }, []);

  const [refused, setRefused] = useState<string | null>(null);

  const act = useCallback((action: WindowAction): void => {
    /* Cleared first. A refusal that outlives the press that caused it is a
       red bar the window keeps for the rest of its life. */
    setRefused(null);

    const done =
      action === 'minimize'
        ? minimizeWindow()
        : action === 'close'
          ? closeWindow()
          : toggleMaximizeWindow();

    /* Reported rather than swallowed. `void closeWindow()` discarded the
       rejection, so a control that could not act looked exactly like one that
       was not wired up — which is how a window nobody could close went
       unnoticed. */
    void done.catch((rejection: unknown) => {
      setRefused(asIpcError(rejection)?.code ?? String(rejection).slice(0, 120));
    });
  }, []);

  return { chrome, maximized, act, refused };
}
