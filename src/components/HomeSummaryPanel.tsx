import type { JSX } from 'react';

import type { LiveSession } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { groupLabel } from '../features/terminal';

import { LogoMark } from './LogoMark';
import { SessionMarker } from './SessionMarker';

interface HomeSummaryPanelProps {
  readonly sessions: readonly LiveSession[];
}

/**
 * Home with nothing picked, in place of `EmptyPanel`'s plain shape for this
 * one screen.
 *
 * `EmptyPanel` says a workspace has nothing open, which is honest for
 * Sessions with no tab yet. It is not honest here: the book already holds
 * whatever hosts are saved the moment this screen renders, so "nothing
 * selected" is not "nothing to say." This keeps `HostsSection`'s own row
 * language (ADR-0052 still holds, no card grid) and says the two things the
 * hero mark alone could not: how many hosts exist, and which of them are
 * live right now.
 */
export function HomeSummaryPanel({ sessions }: HomeSummaryPanelProps): JSX.Element {
  const i18n = useTranslator();
  const connected = sessions.filter((live) => live.kind === 'connected');

  return (
    <div className="flex h-full flex-col gap-7 p-10">
      <div className="flex items-center gap-2.5" aria-hidden="true">
        <LogoMark className="h-[22px] w-[22px]" />
        <span className="text-ink text-[15px] font-bold">{i18n.t('app.name')}</span>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-ink-faint text-[12.5px]">{i18n.t('home.hosts.empty.body')}</p>

        <div className="flex flex-col gap-1">
          <span className="text-ink text-[13px] font-semibold">
            {i18n.t(
              i18n.plural(sessions.length) === 'one'
                ? 'home.hosts.summary.saved.one'
                : 'home.hosts.summary.saved.other',
              { count: String(sessions.length) },
            )}
          </span>
          <span className="text-ok text-[12px] font-semibold">
            {i18n.t(
              i18n.plural(connected.length) === 'one'
                ? 'home.hosts.summary.connected.one'
                : 'home.hosts.summary.connected.other',
              { count: String(connected.length) },
            )}
          </span>
        </div>
      </div>

      {connected.length > 0 && (
        <div className="border-line-subtle flex max-w-[420px] flex-col gap-2 border-t pt-4">
          <span className="text-ink-faint text-[10.5px] font-bold tracking-[0.1em]">
            {i18n.t('home.hosts.summary.connectedNow')}
          </span>

          <ul className="flex flex-col">
            {connected.map((live) => {
              const label = groupLabel(live.session);
              return (
                <li key={live.session.id} className="flex items-center gap-2.5 py-1.5">
                  <SessionMarker kind={live.kind} />
                  <span className="text-ink-secondary min-w-0 flex-1 truncate text-[12.5px]">{label.name}</span>
                  <span className="text-ink-faint shrink-0 truncate font-mono text-[10.5px]">{label.where}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
