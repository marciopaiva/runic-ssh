/**
 * The preferences the whole window reads: the active language and the palette.
 *
 * State and effects live here rather than in a component, per section 6.
 * Changing either re-renders; neither reloads, which is the third thing issue
 * #13 asks for.
 *
 * One provider for both, and one `getSettings()` on mount, because they are one
 * struct in one file on disk. Two providers reading it would be two round trips
 * at launch and two places to notice it failed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { createTranslator, DEFAULT_LOCALE } from '../../lib/i18n';
import type { Translator } from '../../lib/i18n';
import {
  getSettings,
  setLocale as persistLocale,
  setTheme as persistTheme,
} from '../../ipc/settings';
import type { Theme } from '../../ipc/settings';

import { applyTheme } from './apply-theme';
import { detectLocale, systemPreferences } from './detect-locale';

interface SettingsValue {
  readonly i18n: Translator;
  /** `null` while the language follows the operating system. */
  readonly chosen: string | null;
  /** Persists a choice, or clears it with `null` to follow the system again. */
  readonly choose: (locale: string | null) => Promise<void>;
  /** `'system'` while the palette follows the desktop. */
  readonly theme: Theme;
  /** Persists a palette, or `'system'` to follow the desktop again. */
  readonly chooseTheme: (theme: Theme) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [chosen, setChosen] = useState<string | null>(null);
  const [active, setActive] = useState<string>(DEFAULT_LOCALE);
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const system = detectLocale(systemPreferences());
      if (!cancelled) setActive(system);

      try {
        const settings = await getSettings();
        if (cancelled) return;
        setChosen(settings.locale);
        if (settings.locale !== null) setActive(settings.locale);
        setTheme(settings.theme);
      } catch {
        /* A settings file that cannot be read is not a reason to refuse to
           start. The system language and the system palette are both correct
           answers, and the failure surfaces where the user can act on it once
           settings has a screen. */
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* The window starts with no attribute, which is the system palette, and
     settles onto the stored one when it arrives. A choice that differs from the
     desktop therefore shows the desktop's palette for the length of one IPC
     call. Painting nothing until settings load would be a blank window instead,
     which is worse. */
  useEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  const choose = useCallback(async (locale: string | null): Promise<void> => {
    const settings = await persistLocale(locale);
    setChosen(settings.locale);
    setActive(settings.locale ?? detectLocale(systemPreferences()));
  }, []);

  const chooseTheme = useCallback(async (next: Theme): Promise<void> => {
    const settings = await persistTheme(next);
    setTheme(settings.theme);
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({ i18n: createTranslator(active), chosen, choose, theme, chooseTheme }),
    [active, chosen, choose, theme, chooseTheme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (value === undefined) {
    throw new Error('a settings hook was called outside SettingsProvider');
  }
  return value;
}

export function useLocale(): Pick<SettingsValue, 'i18n' | 'chosen' | 'choose'> {
  return useSettings();
}

export function useTheme(): Pick<SettingsValue, 'theme' | 'chooseTheme'> {
  return useSettings();
}

/** The common case: a component that only needs to render text. */
export function useTranslator(): Translator {
  return useSettings().i18n;
}
