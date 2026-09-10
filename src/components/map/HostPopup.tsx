import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';

import { useTranslator } from '../../features/settings';

interface HostPopupProps {
  readonly title: string;
  readonly detail: string;
  /** The wizard, rendered by the shell: the popup only frames it (#357). */
  readonly children: ReactNode;
  /** The wizard's own Cancel, reached from the veil and from Escape, so an
      unsaved draft is asked about the same way it is in Home. */
  readonly onClose: () => void;
}

/**
 * The host editor over the map.
 *
 * The same `SessionWizard` Home draws, in a glass card over the stage, so a
 * host is registered or changed without leaving the map (ADR-0034: the
 * wizard is the only path a credential takes, so this frames it rather than
 * repeating it). A veil over the stage, not a modal over the window
 * (ADR-0015): the other windows keep their sessions, they only wait.
 */
export function HostPopup({ title, detail, children, onClose }: HostPopupProps): JSX.Element {
  const i18n = useTranslator();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-map-popup=""
      className="absolute inset-0 z-[450] flex items-center justify-center p-6"
      style={{ background: 'var(--rs-glass-panel)' }}
      /* The stage pans on any press it sees; nothing inside this reaches it. */
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-labelledby="map-host-popup-title"
        className="border-line-strong flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-lg border"
        style={{
          background: 'var(--rs-glass-fill)',
          backdropFilter: 'blur(var(--rs-glass-blur))',
          WebkitBackdropFilter: 'blur(var(--rs-glass-blur))',
          boxShadow: 'inset 0 1px 0 var(--rs-glass-top), var(--rs-shadow-5)',
        }}
      >
        <header className="border-line-subtle flex items-start gap-3 border-b px-4 pt-3.5 pb-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="map-host-popup-title" className="text-ink text-[13.5px] font-bold">
              {title}
            </h2>
            <p className="text-ink-muted mt-0.5 text-[11.5px]">{detail}</p>
          </div>
          <button
            type="button"
            aria-label={i18n.t('hostKey.action.cancel')}
            title={i18n.t('hostKey.action.cancel')}
            onClick={onClose}
            className="text-ink-faint hover:bg-surface-raised hover:text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded text-[13px]"
          >
            &#10005;
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </section>
    </div>
  );
}
