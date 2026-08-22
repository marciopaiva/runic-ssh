/**
 * The active language, and the ability to change it.
 *
 * State and effects live here rather than in a component, per section 6.
 * Changing the language re-renders; it never reloads, which is the third thing
 * issue #13 asks for.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { createTranslator, DEFAULT_LOCALE } from '../../lib/i18n';
import type { Translator } from '../../lib/i18n';
/* From the module rather than the barrel: this provider is mounted in the
   credential window too, and the barrel would drag the terminal wrappers in
   with it. See tests/credential-window.test.ts. */
import { getSettings, setLocale as persistLocale } from '../../ipc/settings';

import { detectLocale, systemPreferences } from './detect-locale';

interface LocaleValue {
  readonly i18n: Translator;
  /** `null` while the language follows the operating system. */
  readonly chosen: string | null;
  /** Persists a choice, or clears it with `null` to follow the system again. */
  readonly choose: (locale: string | null) => Promise<void>;
}

const LocaleContext = createContext<LocaleValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  const [chosen, setChosen] = useState<string | null>(null);
  const [active, setActive] = useState<string>(DEFAULT_LOCALE);

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
      } catch {
        /* A settings file that cannot be read is not a reason to refuse to
           start. The system language is a correct answer, and the failure
           surfaces where the user can act on it once settings has a screen. */
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(async (locale: string | null): Promise<void> => {
    const settings = await persistLocale(locale);
    setChosen(settings.locale);
    setActive(settings.locale ?? detectLocale(systemPreferences()));
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ i18n: createTranslator(active), chosen, choose }),
    [active, chosen, choose],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (value === undefined) {
    throw new Error('useLocale was called outside LocaleProvider');
  }
  return value;
}

/** The common case: a component that only needs to render text. */
export function useTranslator(): Translator {
  return useLocale().i18n;
}
