import type { JSX } from 'react';

import { useTranslator } from '../features/settings';

export type HomeSection = 'dashboard' | 'hosts';

interface HomeNavProps {
  readonly section: HomeSection;
  readonly onChoose: (section: HomeSection) => void;
}

const SECTIONS: readonly { readonly id: HomeSection; readonly label: 'home.title' | 'home.hosts' }[] = [
  { id: 'dashboard', label: 'home.title' },
  { id: 'hosts', label: 'home.hosts' },
];

/**
 * Home's own navigation: Dashboard, Hosts. Settings used to be a third
 * section here and is a card on the dashboard now, small enough after the
 * title bar option left it (`HomeDashboard`'s own note) that a whole
 * destination for it was more chrome than the two controls underneath it.
 * A breadcrumb rather than a tab strip, because neither remaining section is
 * a document somebody is mid-edit on the way between. A host form is that,
 * which is why editing one does not live out here: `HostsSection` keeps a
 * list beside the one form open, and this bar only chooses which section
 * shows.
 */
export function HomeNav({ section, onChoose }: HomeNavProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <nav
      aria-label={i18n.t('home.title')}
      className="border-line-subtle bg-surface-chrome flex h-8 shrink-0 items-center gap-1 border-b px-2"
    >
      {SECTIONS.map(({ id, label }) => {
        const current = id === section;

        return (
          <button
            key={id}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={() => onChoose(id)}
            className={`rounded px-2.5 py-1 text-[12px] font-medium ${
              current ? 'bg-surface-raised text-ink' : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {i18n.t(label)}
          </button>
        );
      })}
    </nav>
  );
}
