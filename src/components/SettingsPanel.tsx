import { useState } from 'react';
import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import { offeredLocales } from '../lib/i18n/locales';

/** The sections down the left of the panel. One so far; Sessions follows. */
export type SettingsSection = 'appearance';

const SECTIONS: readonly SettingsSection[] = ['appearance'];

interface SettingsPanelProps {
  /** The chosen locale tag, or `null` while following the system. */
  readonly chosenLocale: string | null;
  readonly onChooseLocale: (locale: string | null) => void;
  /** Whether the window manager is drawing the title bar (ADR-0005). */
  readonly nativeDecorations: boolean;
  readonly onUseNativeDecorations: (native: boolean) => void;
}

/**
 * The settings tab's contents.
 *
 * Its own navigation down the side, the way the Windows Terminal settings tab
 * is arranged — one of the two vocabularies the visual direction adopted. The
 * panel is a tab rather than a modal so that a terminal stays open beside it,
 * which a dialog drawn over the window cannot do.
 *
 * Nothing secret reaches this component. A password is collected in a separate
 * OS window at the moment of connecting (ADR-0008), and putting a field for one
 * here would place it in the same document that renders terminal output.
 */
export function SettingsPanel({
  chosenLocale,
  onChooseLocale,
  nativeDecorations,
  onUseNativeDecorations,
}: SettingsPanelProps): JSX.Element {
  const i18n = useTranslator();
  const [section, setSection] = useState<SettingsSection>('appearance');

  return (
    <div className="bg-surface-base flex h-full min-h-0">
      <nav
        aria-label={i18n.t('settings.nav')}
        className="border-line-subtle flex w-[180px] shrink-0 flex-col gap-0.5 border-r p-3"
      >
        <h1 className="text-ink-muted mb-2 px-2 text-[11px] font-semibold tracking-wide uppercase">
          {i18n.t('settings.title')}
        </h1>

        {SECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            aria-current={section === name ? 'page' : undefined}
            onClick={() => setSection(name)}
            className={`rounded px-2 py-1.5 text-left text-[12.5px] ${
              section === name
                ? 'bg-surface-raised text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {i18n.t(`settings.${name}`)}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="flex max-w-[560px] flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-ink text-[14px] font-semibold">
              {i18n.t('settings.appearance')}
            </h2>
            <p className="text-ink-secondary text-[12.5px] leading-relaxed">
              {i18n.t('settings.appearance.lead')}
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-ink text-[12.5px] font-medium">
              {i18n.t('settings.language')}
            </span>
            <select
              value={chosenLocale ?? ''}
              onChange={(event) =>
                onChooseLocale(event.target.value === '' ? null : event.target.value)
              }
              className="bg-surface-input text-ink border-line-subtle w-[260px] rounded border px-2.5 py-1.5 text-[12.5px] outline-none"
            >
              <option value="">{i18n.t('settings.language.system')}</option>
              {offeredLocales().map((locale) => (
                /* The language's own name for itself, never translated: a
                   reader looking for their language cannot find it under a
                   name written in one they do not read. */
                <option key={locale.tag} value={locale.tag}>
                  {locale.name}
                </option>
              ))}
            </select>
            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.language.hint')}
            </span>
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-ink pb-1.5 text-[12.5px] font-medium">
              {i18n.t('settings.decorations')}
            </legend>

            {/* Two radios rather than a checkbox: the choice is between two
                things that are both drawn, and a checkbox labelled "native
                decorations" leaves the off state unnamed. */}
            {[false, true].map((native) => (
              <label key={String(native)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decorations"
                  checked={nativeDecorations === native}
                  onChange={() => onUseNativeDecorations(native)}
                  className="accent-accent"
                />
                <span className="text-ink-secondary text-[12.5px]">
                  {i18n.t(native ? 'settings.decorations.native' : 'settings.decorations.drawn')}
                </span>
              </label>
            ))}

            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.decorations.hint')}
            </span>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
