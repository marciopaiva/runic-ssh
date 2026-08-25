import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import type { Theme } from '../ipc';
import { offeredLocales } from '../lib/i18n/locales';

/* In the order the canvas draws them, which is the order they were argued in:
   the default first, then the two that override it. */
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

interface SettingsPanelProps {
  /** The chosen locale tag, or `null` while following the system. */
  readonly chosenLocale: string | null;
  readonly onChooseLocale: (locale: string | null) => void;
  /** Whether the window manager is drawing the title bar (ADR-0005). */
  readonly nativeDecorations: boolean;
  readonly onUseNativeDecorations: (native: boolean) => void;
  /** The chosen palette, or `'system'` while following the desktop. */
  readonly theme: Theme;
  readonly onChooseTheme: (theme: Theme) => void;
}

/**
 * The settings tab's contents.
 *
 * A tab rather than a modal so that a terminal stays open beside it, which a
 * dialog drawn over the window cannot do.
 *
 * It used to carry the host editor and a navigation column to switch between
 * the two. Both are gone: a stored host is not a preference, and creating one
 * is a task that had no business happening under a tab labelled "Settings".
 * The editor has its own tab now. The column comes back when there is a second
 * section to reach with it, and not before — navigation with one destination is
 * chrome pretending to be structure.
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
  theme,
  onChooseTheme,
}: SettingsPanelProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div className="bg-surface-base h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto p-7">
        <div className="flex max-w-[560px] flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-ink text-[14px] font-semibold">
              {i18n.t('settings.appearance')}
            </h2>
            <p className="text-ink-secondary text-[12.5px] leading-relaxed">
              {i18n.t('settings.appearance.lead')}
            </p>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-ink pb-1.5 text-[12.5px] font-medium">
              {i18n.t('settings.theme')}
            </legend>

            {/* Radios drawn as the segmented control the canvas draws, rather
                than buttons that look like one. The input is what carries the
                group to a keyboard and a screen reader; hiding it and painting
                its label keeps both. */}
            <div className="flex gap-2">
              {THEMES.map((option) => (
                <label key={option} className="cursor-pointer">
                  <input
                    type="radio"
                    name="theme"
                    value={option}
                    checked={theme === option}
                    onChange={() => onChooseTheme(option)}
                    className="peer sr-only"
                  />
                  <span className="border-line-subtle text-ink-secondary peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-ink peer-focus-visible:outline-accent block rounded border px-4 py-1.5 text-[12.5px] peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                    {i18n.t(`settings.theme.${option}`)}
                  </span>
                </label>
              ))}
            </div>

            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.theme.hint')}
            </span>
          </fieldset>

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

/**
 * Saved hosts, and the form for whichever one is open.
 *
 * The list and the form share one slot: opening another host replaces what is
 * on screen. That is why the discard bar exists rather than being a nicety —
 * as a modal this form was answered and dismissed in one go, and there was
 * never a second host to move to.
 */
