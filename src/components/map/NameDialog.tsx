import { useState } from 'react';
import type { JSX } from 'react';

import { MAX_VISION_NAME } from '../../features/map';
import { useTranslator } from '../../features/settings';
import { SessionSurface, SurfaceAction } from '../SessionSurface';

interface NameDialogProps {
  readonly title: string;
  readonly body: string;
  /** The name to start from: empty for a new vision, the current one to rename. */
  readonly initial: string;
  readonly onSave: (name: string) => void;
  readonly onClose: () => void;
}

/**
 * One question, a name, on the same card the picker asks its question on
 * (ADR-0015): what a new vision is called, or what an existing one becomes.
 * Enter saves, Escape leaves, and an empty name saves nothing.
 */
export function NameDialog({ title, body, initial, onSave, onClose }: NameDialogProps): JSX.Element {
  const i18n = useTranslator();
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const acceptable = trimmed.length > 0 && trimmed.length <= MAX_VISION_NAME;
  const save = (): void => {
    if (acceptable) onSave(trimmed);
  };
  return (
    <div
      className="absolute inset-0 z-[400] flex items-center justify-center"
      style={{ background: 'var(--rs-glass-panel)' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="w-[420px] max-w-full">
        <SessionSurface
          titleId="map-name-dialog-title"
          title={title}
          body={body}
          actions={
            <>
              <SurfaceAction variant="primary" onClick={save} disabled={!acceptable}>
                {i18n.t('map.vision.name.save')}
              </SurfaceAction>
              <SurfaceAction variant="secondary" onClick={onClose}>
                {i18n.t('hostKey.action.cancel')}
              </SurfaceAction>
            </>
          }
        >
          <input
            autoFocus
            type="text"
            value={name}
            maxLength={MAX_VISION_NAME}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              save();
            }}
            placeholder={i18n.t('map.vision.name.label')}
            aria-label={i18n.t('map.vision.name.label')}
            className="bg-surface-input border-line-subtle focus:border-accent text-ink h-[30px] w-full rounded border px-2.5 text-[12.5px] outline-none"
          />
        </SessionSurface>
      </div>
    </div>
  );
}
