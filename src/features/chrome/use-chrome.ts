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
  closeWindow,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
  windowChrome,
} from '../../ipc';
import type { WindowChrome } from '../../ipc';

import { actOnWindow } from './refusal';
import type { WindowControls } from './refusal';

import type { WindowAction } from './controls';

/* The wrappers, bound once. `actOnWindow` takes them as an argument so a test
   can hand it a control that refuses — which is the only way to reach that
   path, since a real window cannot be made to refuse on demand. */
const CONTROLS: WindowControls = {
  minimize: minimizeWindow,
  toggleMaximize: toggleMaximizeWindow,
  close: closeWindow,
};

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
    void actOnWindow(action, CONTROLS, setRefused);
  }, []);

  return { chrome, maximized, act, refused };
}
