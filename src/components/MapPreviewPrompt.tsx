import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

import { SessionSurface, SurfaceAction } from './SessionSurface';
import { MapIcon } from './ui/icons';

interface MapPreviewPromptProps {
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}

/**
 * What choosing the map pill shows instead of the map, while
 * `previewFeatures` is off (ADR-0073).
 *
 * Built on `SessionSurface`, the shape `HostKeyBlocked` and its siblings use
 * for an explicit interrupt, but without their type-to-confirm friction:
 * that guards a destructive override, and accepting a preview is not one.
 * No `alert`, unlike those screens, since this one only appears because the
 * pill was clicked, never unbidden.
 */
export function MapPreviewPrompt({ onAccept, onCancel }: MapPreviewPromptProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <SessionSurface
      titleId="map-preview-prompt-title"
      title={i18n.t('shell.preview.title')}
      icon={<MapIcon width={19} height={19} />}
      body={i18n.t('shell.preview.body')}
      actions={
        <>
          <SurfaceAction onClick={onCancel} variant="secondary">
            {i18n.t('shell.preview.cancel')}
          </SurfaceAction>
          <SurfaceAction onClick={onAccept} variant="primary">
            {i18n.t('shell.preview.accept')}
          </SurfaceAction>
        </>
      }
    />
  );
}
