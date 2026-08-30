import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { offerInternalVault, useTranslator } from '../features/settings';
import { credentialStoreStatus, internalVaultStatus } from '../ipc';
import type { Theme } from '../ipc';
import { offeredLocales } from '../lib/i18n/locales';

import { Card } from './Card';
import { VaultCard } from './VaultCard';

const FLAG: Readonly<Record<string, string>> = {
  en: '🇺🇸',
  'pt-BR': '🇧🇷',
  es: '🇪🇸',
};

interface HomeDashboardProps {
  readonly hostCount: number;
  readonly groupCount: number;
  readonly onAddHost: () => void;
  readonly onOpenHosts: () => void;
  /** The chosen palette, or `'system'` while following the desktop. */
  readonly theme: Theme;
  readonly onChooseTheme: (theme: Theme) => void;
  /** The chosen locale tag, or `null` while following the system. */
  readonly chosenLocale: string | null;
  readonly onChooseLocale: (locale: string | null) => void;
}

/**
 * Home's landing section: a card per domain, the shape the maintainer asked
 * for once Appearance had proven it out. Hosts and Appearance always;
 * the internal vault (ADR-0035) only when it has something to offer, see
 * `offerInternalVault`. Nothing else yet, because nothing else exists to
 * make a card honest. SFTP gets one the day #127 does and not before, the
 * same rule ADR-0020 already held for the rail.
 */
export function HomeDashboard({
  hostCount,
  groupCount,
  onAddHost,
  onOpenHosts,
  theme,
  onChooseTheme,
  chosenLocale,
  onChooseLocale,
}: HomeDashboardProps): JSX.Element {
  const i18n = useTranslator();
  /* `undefined` while either probe is in flight, which reads as "not yet
     decided" rather than "hide": a wrong first paint that shows the card
     for one frame is nothing, one that hides it and never reconsiders would
     be a real loss. Probed once, on mount, the same as `VaultCard`'s own
     status; re-evaluates on the next visit to Home rather than reacting to
     an action taken inside the card itself, which is the one gap worth
     naming here. Disabling the vault back to the keychain, on a machine
     where the keychain works, leaves the card visible for the rest of this
     visit instead of disappearing mid-session: `VaultCard` still reflects
     the true state correctly, this only decides whether it is on screen at
     all. */
  const [showVault, setShowVault] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    void Promise.all([internalVaultStatus(), credentialStoreStatus()]).then(
      ([vaultStatus, keychainStatus]) => setShowVault(offerInternalVault(vaultStatus, keychainStatus)),
    );
  }, []);

  return (
    <div className="flex h-full flex-col items-center gap-8 overflow-y-auto p-8 pt-14">
      <h1 className="text-ink text-[15px] font-semibold">{i18n.t('home.title')}</h1>

      <div className="grid w-full max-w-[700px] grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          title={i18n.t('home.hosts')}
          onClick={onOpenHosts}
          label={i18n.t('home.hosts.open')}
        >
          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-1">
              <span className="text-ink font-mono text-[26px] font-bold">{hostCount}</span>
              <span className="text-ink-faint text-[11px] tracking-[0.06em] uppercase">
                {i18n.t('home.hosts')}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-ink font-mono text-[26px] font-bold">{groupCount}</span>
              <span className="text-ink-faint text-[11px] tracking-[0.06em] uppercase">
                {i18n.t('home.groups')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(event) => {
              /* Its own action, not the card's: this opens a new draft, the
                 card underneath it only opens the list. Bubbling would fire
                 both, and the second is harmless but is not what the click
                 meant. */
              event.stopPropagation();
              onAddHost();
            }}
            className="bg-accent text-surface-base self-start rounded px-3 py-1.5 text-[12px] font-semibold"
          >
            {i18n.t('sessions.add')}
          </button>
        </Card>

        <Card title={i18n.t('settings.appearance')}>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-[11px] tracking-[0.06em] uppercase">
              {i18n.t('settings.theme')}
            </span>

            <div role="radiogroup" aria-label={i18n.t('settings.theme')} className="flex gap-2">
              <ThemeButton
                current={theme}
                value="system"
                label={i18n.t('settings.theme.system')}
                onChoose={onChooseTheme}
              >
                <path d="M4 5h16v11H4z" />
                <path d="M9 20h6M12 16v4" strokeLinecap="round" />
              </ThemeButton>

              <ThemeButton
                current={theme}
                value="light"
                label={i18n.t('settings.theme.light')}
                onChoose={onChooseTheme}
              >
                <circle cx="12" cy="12" r="4.2" />
                <path
                  d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"
                  strokeLinecap="round"
                />
              </ThemeButton>

              <ThemeButton
                current={theme}
                value="dark"
                label={i18n.t('settings.theme.dark')}
                onChoose={onChooseTheme}
              >
                <path d="M20 13.8A8.5 8.5 0 1110.2 4a6.8 6.8 0 009.8 9.8z" strokeLinejoin="round" />
              </ThemeButton>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-ink-faint text-[11px] tracking-[0.06em] uppercase">
              {i18n.t('settings.language')}
            </span>

            <div role="radiogroup" aria-label={i18n.t('settings.language')} className="flex gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={chosenLocale === null}
                aria-label={i18n.t('settings.language.system')}
                title={i18n.t('settings.language.system')}
                onClick={() => onChooseLocale(null)}
                className={`flex h-9 w-9 items-center justify-center rounded border text-[16px] ${
                  chosenLocale === null
                    ? 'border-accent bg-accent-soft'
                    : 'border-line-subtle hover:bg-surface-raised/60'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="text-ink-secondary h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" />
                </svg>
              </button>

              {offeredLocales().map((locale) => (
                <button
                  key={locale.tag}
                  type="button"
                  role="radio"
                  aria-checked={chosenLocale === locale.tag}
                  aria-label={locale.name}
                  title={locale.name}
                  onClick={() => onChooseLocale(locale.tag)}
                  className={`flex h-9 w-9 items-center justify-center rounded border text-[16px] ${
                    chosenLocale === locale.tag
                      ? 'border-accent bg-accent-soft'
                      : 'border-line-subtle hover:bg-surface-raised/60'
                  }`}
                >
                  <span aria-hidden="true">{FLAG[locale.tag] ?? locale.name.slice(0, 2)}</span>
                </button>
              ))}
            </div>

            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.language.hint')}
            </span>
          </div>
        </Card>

        {showVault === true && (
          <Card title={i18n.t('vault.title')}>
            <VaultCard />
          </Card>
        )}
      </div>
    </div>
  );
}

interface ThemeButtonProps {
  readonly current: Theme;
  readonly value: Theme;
  readonly label: string;
  readonly onChoose: (theme: Theme) => void;
  readonly children: JSX.Element | readonly JSX.Element[];
}

/** One icon of the theme picker. A shape rather than a swatch: the choice is
 * which palette drives the window, not a colour to preview standing still. */
function ThemeButton({ current, value, label, onChoose, children }: ThemeButtonProps): JSX.Element {
  const checked = current === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChoose(value)}
      className={`flex h-9 w-9 items-center justify-center rounded border ${
        checked ? 'border-accent bg-accent-soft text-ink' : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
