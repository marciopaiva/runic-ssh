import { useEffect, useRef, useState } from 'react';
import type { JSX, RefObject } from 'react';

import { useTranslator } from '../features/settings';
import type { Theme } from '../ipc';
import type { ParameterlessKey } from '../lib/i18n';
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
 * click invented to hide two unrelated settings behind one icon.
 *
 * That comparison named the wrong half of `SftpSplitControl`, found live
 * comparing the two directly: the "undisguised" part was never "every
 * choice shown flat," it was "in the toolbar, not behind a gear." What
 * `SftpSplitControl` (and `ShapeControl` beside it) actually do for "which
 * one of several things is this" is fold the choices behind one button
 * that keeps showing which one is current, and open the rest only on
 * click, the same reasoning `SftpSplitControl`'s own doc comment gives for
 * not drawing its four rows-choices flat: "a bare row of buttons... reads
 * as two rules rather than one." Seven chips in a row (three theme, four
 * language) was exactly that second rule. ADR-0059 is that correction: two
 * fold controls, one per setting, keep the "not behind a shared gear"
 * answer ADR-0052 settled and adopt the toolbar's own established "one
 * button, current state showing" answer for everything else it does not
 * name specifically.
 */
export function ThemeLanguageControls({
  theme,
  onChooseTheme,
  chosenLocale,
  onChooseLocale,
}: ThemeLanguageControlsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <ThemeFold theme={theme} onChoose={onChooseTheme} />
      <span className="bg-line-subtle h-4 w-px shrink-0" aria-hidden="true" />
      <LanguageFold chosenLocale={chosenLocale} onChoose={onChooseLocale} />
    </div>
  );
}

/** Closes a fold control when the pointer lands outside `box`, or on
 * Escape: the same behaviour `ShapeControl`/`SftpSplitControl` already
 * keep, repeated here rather than shared because a third caller is not
 * yet a pattern worth naming a component for on its own. */
function useFold(): {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  readonly box: RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || box.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return { open, toggle: () => setOpen((showing) => !showing), close: () => setOpen(false), box };
}

function ThemeGlyph({ theme, size }: { readonly theme: Theme; readonly size: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {theme === 'system' && (
        <>
          <path d="M4 5h16v11H4z" />
          <path d="M9 20h6M12 16v4" strokeLinecap="round" />
        </>
      )}
      {theme === 'light' && (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path
            d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"
            strokeLinecap="round"
          />
        </>
      )}
      {theme === 'dark' && <path d="M20 13.8A8.5 8.5 0 1110.2 4a6.8 6.8 0 009.8 9.8z" strokeLinejoin="round" />}
    </svg>
  );
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const THEME_LABEL: Readonly<Record<Theme, ParameterlessKey>> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
};

function ThemeFold({ theme, onChoose }: { readonly theme: Theme; readonly onChoose: (theme: Theme) => void }): JSX.Element {
  const i18n = useTranslator();
  const { open, toggle, close, box } = useFold();

  return (
    <div ref={box} className="relative flex shrink-0 items-center self-center">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={i18n.t('settings.theme')}
        title={i18n.t(THEME_LABEL[theme])}
        className={`flex h-6 w-6 items-center justify-center rounded border ${
          open ? 'border-accent bg-accent-soft text-ink' : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
        }`}
      >
        <ThemeGlyph theme={theme} size="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={i18n.t('settings.theme')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            close();
          }}
          className="bg-surface-overlay border-line-strong absolute top-full right-0 z-50 mt-1 flex gap-1 rounded border p-1.5 shadow-2xl"
        >
          {THEMES.map((kind) => {
            const current = kind === theme;
            const label = i18n.t(THEME_LABEL[kind]);

            return (
              <button
                key={kind}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => {
                  onChoose(kind);
                  close();
                }}
                aria-label={label}
                title={label}
                className={`flex h-8 w-9 items-center justify-center rounded ${
                  current
                    ? 'bg-surface-raised text-accent'
                    : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
                }`}
              >
                <ThemeGlyph theme={kind} size="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobeGlyph({ size }: { readonly size: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" />
    </svg>
  );
}

function LanguageFold({
  chosenLocale,
  onChoose,
}: {
  readonly chosenLocale: string | null;
  readonly onChoose: (locale: string | null) => void;
}): JSX.Element {
  const i18n = useTranslator();
  const { open, toggle, close, box } = useFold();
  const locales = offeredLocales();
  const current = locales.find((locale) => locale.tag === chosenLocale);
  const currentLabel = current !== undefined ? current.name : i18n.t('settings.language.system');

  return (
    <div ref={box} className="relative flex shrink-0 items-center self-center">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={i18n.t('settings.language')}
        title={currentLabel}
        className={`flex h-6 w-6 items-center justify-center rounded border text-[12px] ${
          open ? 'border-accent bg-accent-soft' : 'border-line-subtle hover:bg-surface-raised/60'
        }`}
      >
        {current !== undefined ? (
          <span aria-hidden="true">{FLAG[current.tag] ?? current.name.slice(0, 2)}</span>
        ) : (
          <GlobeGlyph size="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={i18n.t('settings.language')}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            close();
          }}
          className="bg-surface-overlay border-line-strong absolute top-full right-0 z-50 mt-1 flex gap-1 rounded border p-1.5 shadow-2xl"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={chosenLocale === null}
            onClick={() => {
              onChoose(null);
              close();
            }}
            aria-label={i18n.t('settings.language.system')}
            title={i18n.t('settings.language.system')}
            className={`flex h-8 w-9 items-center justify-center rounded ${
              chosenLocale === null
                ? 'bg-surface-raised text-accent'
                : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
            }`}
          >
            <GlobeGlyph size="h-4 w-4" />
          </button>

          {locales.map((locale) => (
            <button
              key={locale.tag}
              type="button"
              role="menuitemradio"
              aria-checked={chosenLocale === locale.tag}
              onClick={() => {
                onChoose(locale.tag);
                close();
              }}
              aria-label={locale.name}
              title={locale.name}
              className={`flex h-8 w-9 items-center justify-center rounded text-[15px] ${
                chosenLocale === locale.tag
                  ? 'bg-surface-raised text-accent'
                  : 'text-ink-faint hover:bg-surface-raised/60 hover:text-ink-muted'
              }`}
            >
              <span aria-hidden="true">{FLAG[locale.tag] ?? locale.name.slice(0, 2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
