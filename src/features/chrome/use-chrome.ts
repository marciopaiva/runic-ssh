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
  setNativeDecorations,
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
  /** Whether the window manager is drawing the title bar. */
  readonly nativeDecorations: boolean;
  /** Hands the title bar to the window manager, or takes it back. */
  readonly useNativeDecorations: (native: boolean) => void;
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

  /* The core answers with the chrome that resulted, and that answer is what
     the bar lays out from. Setting the layout from the requested value would
     be a guess: a window manager can refuse a decoration change on a mapped
     window, and then the bar would draw for a title bar that is not there. */
  const useNativeDecorations = useCallback((native: boolean): void => {
    void setNativeDecorations(native)
      .then(setChrome)
      .catch(() => setRefused('windowActionRefused'));
  }, []);

  /* Read from the chrome the core sent, not tracked separately. A second copy
     could disagree with the one the layout uses, and the symptom would be a
     menu entry offering to turn on what is already on. */
  const nativeDecorations = chrome?.nativeDecorations ?? false;

  return { chrome, maximized, act, refused, nativeDecorations, useNativeDecorations };
}
