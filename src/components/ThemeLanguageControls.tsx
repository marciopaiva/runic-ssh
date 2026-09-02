import type { JSX, ReactNode } from 'react';

import { useTranslator } from '../features/settings';
import type { Theme } from '../ipc';
import { offeredLocales } from '../lib/i18n/locales';

const FLAG: Readonly<Record<string, string>> = {
  en: '🇺🇸',
  'pt-BR': '🇧🇷',
  es: '🇪🇸',
};

interface ThemeLanguageControlsProps {
  /** The chosen palette, or `'system'` while following the desktop. */
  readonly theme: Theme;
  readonly onChooseTheme: (theme: Theme) => void;
  /** The chosen locale tag, or `null` while following the system. */
  readonly chosenLocale: string | null;
  readonly onChooseLocale: (locale: string | null) => void;
}

/**
 * Theme and language, inline in Home's own toolbar. ADR-0052: a first cut
 * put these behind a gear icon in a popover, reverted directly once
 * compared against `SftpSelectAllButton`/`SftpSplitControl`, which already
 * sit undisguised in SFTP's own toolbar (ADR-0046) rather than behind a
 * click invented to hide them. Home-only, on purpose: a "set once and
 * forget" choice does not belong in Sessions' or SFTP's own toolbars, which
 * stay chrome-minimal.
 */
export function ThemeLanguageControls({
  theme,
  onChooseTheme,
  chosenLocale,
  onChooseLocale,
}: ThemeLanguageControlsProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div className="flex items-center gap-2.5">
      <div role="radiogroup" aria-label={i18n.t('settings.theme')} className="flex gap-1">
        <ChipButton
          checked={theme === 'system'}
          label={i18n.t('settings.theme.system')}
          onChoose={() => onChooseTheme('system')}
        >
          <path d="M4 5h16v11H4z" />
          <path d="M9 20h6M12 16v4" strokeLinecap="round" />
        </ChipButton>
        <ChipButton
          checked={theme === 'light'}
          label={i18n.t('settings.theme.light')}
          onChoose={() => onChooseTheme('light')}
        >
          <circle cx="12" cy="12" r="4.2" />
          <path
            d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"
            strokeLinecap="round"
          />
        </ChipButton>
        <ChipButton
          checked={theme === 'dark'}
          label={i18n.t('settings.theme.dark')}
          onChoose={() => onChooseTheme('dark')}
        >
          <path d="M20 13.8A8.5 8.5 0 1110.2 4a6.8 6.8 0 009.8 9.8z" strokeLinejoin="round" />
        </ChipButton>
      </div>

      <span className="bg-line-subtle h-4 w-px shrink-0" aria-hidden="true" />

      <div role="radiogroup" aria-label={i18n.t('settings.language')} className="flex gap-1">
        <ChipButton
          checked={chosenLocale === null}
          label={i18n.t('settings.language.system')}
          onChoose={() => onChooseLocale(null)}
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" />
        </ChipButton>

        {offeredLocales().map((locale) => (
          <FlagButton
            key={locale.tag}
            checked={chosenLocale === locale.tag}
            label={locale.name}
            onChoose={() => onChooseLocale(locale.tag)}
            emoji={FLAG[locale.tag] ?? locale.name.slice(0, 2)}
          />
        ))}
      </div>
    </div>
  );
}

interface ChipButtonProps {
  readonly checked: boolean;
  readonly label: string;
  readonly onChoose: () => void;
  readonly children: ReactNode;
}

/** One 24px chip, sized for the toolbar's own 34px strip rather than
 * `ThemeButton`'s 36px, which belonged to a card with room to spare. */
function ChipButton({ checked, label, onChoose, children }: ChipButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChoose}
      className={`flex h-6 w-6 items-center justify-center rounded border ${
        checked
          ? 'border-accent bg-accent-soft text-ink'
          : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

interface FlagButtonProps {
  readonly checked: boolean;
  readonly label: string;
  readonly onChoose: () => void;
  readonly emoji: string;
}

function FlagButton({ checked, label, onChoose, emoji }: FlagButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChoose}
      className={`flex h-6 w-6 items-center justify-center rounded border text-[12px] ${
        checked ? 'border-accent bg-accent-soft' : 'border-line-subtle hover:bg-surface-raised/60'
      }`}
    >
      <span aria-hidden="true">{emoji}</span>
    </button>
  );
}
