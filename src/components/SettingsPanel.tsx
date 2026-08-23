import type { JSX } from 'react';

import { useTranslator } from '../features/settings';
import { offeredLocales } from '../lib/i18n/locales';

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
