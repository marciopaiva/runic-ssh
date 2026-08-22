/**
 * Choosing how the terminal paints.
 *
 * ADR-0006 chose the WebGL addon with the built-in DOM renderer as the
 * fallback, and accepted in writing that "fast" is a promise kept on Windows
 * and macOS and not guaranteed on every Linux configuration. This module is
 * where that decision meets reality.
 *
 * Two ways WebGL fails, and both have to be handled or the terminal goes
 * blank rather than slow:
 *
 * - **It is unavailable at startup.** A machine with no GPU, a virtual
 *   machine, a driver the webview cannot use. The addon throws when loaded.
 * - **The context is lost while running.** A driver reset, a laptop switching
 *   GPUs, the system reclaiming memory. The addon reports it, and from that
 *   moment it draws nothing at all.
 */

import type { Terminal } from '@xterm/xterm';

export type RendererKind = 'webgl' | 'dom';

export interface RendererChoice {
  readonly kind: RendererKind;
  /** Why the fallback was taken, when it was. Shown in settings, not hidden. */
  readonly reason?: string;
  dispose(): void;
}

/**
 * Attaches the fastest renderer that works, and keeps working if it stops.
 *
 * `onFallback` fires when a context is lost *after* startup, so the interface
 * can tell the user why the terminal changed character rather than leaving
 * them to wonder.
 */
export async function attachRenderer(
  terminal: Terminal,
  onFallback?: (reason: string) => void,
): Promise<RendererChoice> {
  const dom: RendererChoice = {
    kind: 'dom',
    dispose: () => {},
  };

  try {
    const { WebglAddon } = await import('@xterm/addon-webgl');
    const addon = new WebglAddon();

    /* Losing the context is not an error to report and move on from: the
       addon stops drawing entirely. Disposing it hands rendering back to the
       DOM renderer, which is the only way the terminal keeps working. */
    addon.onContextLoss(() => {
      addon.dispose();
      onFallback?.('The graphics context was lost, so the terminal fell back to software rendering.');
    });

    terminal.loadAddon(addon);

    return {
      kind: 'webgl',
      dispose: () => {
        addon.dispose();
      },
    };
  } catch (error) {
    /* Thrown when WebGL2 is unavailable. Not a failure — the documented
       fallback, on exactly the configurations ADR-0006 named. */
    return {
      ...dom,
      reason:
        error instanceof Error
          ? `WebGL is unavailable (${error.message}), so the terminal renders in software.`
          : 'WebGL is unavailable, so the terminal renders in software.',
    };
  }
}
