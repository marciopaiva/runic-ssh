import type { JSX } from 'react';

import { hostRows, hostSections } from '../features/sessions';
import type { LiveSession } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { groupLabel } from '../features/terminal';
import type { Macro } from '../ipc';

import { LogoMark } from './LogoMark';
import { SessionMarker } from './SessionMarker';

interface HomeSummaryPanelProps {
  readonly sessions: readonly LiveSession[];
  readonly macros: readonly Macro[];
  readonly onOpenMacros: () => void;
  /** Jumps to this session's tab in Sessions, opening one if it does not
      have one yet (`activate` in `App.tsx`: the same path the palette and
      the retry button already use, so a session connected from SFTP gets a
      Sessions tab on click same as one connected from here). */
  readonly onActivateSession: (sessionId: string) => void;
}

/**
 * Home with nothing picked, in place of `EmptyPanel`'s plain shape for this
 * one screen.
 *
 * `EmptyPanel` says a workspace has nothing open, which is honest for
 * Sessions with no tab yet. It is not honest here: the book already holds
 * whatever hosts are saved the moment this screen renders, so "nothing
 * selected" is not "nothing to say." This keeps `HostsSection`'s own row
 * language (ADR-0052 still holds, no card grid) and says what the hero mark
 * alone could not: how many hosts exist and how they are shaped (direct vs.
 * jump servers), which of them are live right now, and how many macros are
 * saved, with a way to open them without leaving Home for Sessions or Map
 * first.
 */
export function HomeSummaryPanel({
  sessions,
  macros,
  onOpenMacros,
  onActivateSession,
}: HomeSummaryPanelProps): JSX.Element {
  const i18n = useTranslator();
  const connected = sessions.filter((live) => live.kind === 'connected');
  const { bastions, direct } = hostSections(hostRows(sessions));

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
          {sessions.length > 0 && (direct.length > 0 || bastions.length > 0) && (
            <span className="text-ink-faint text-[11.5px]">
              {[
                direct.length > 0 &&
                  i18n.t(
                    i18n.plural(direct.length) === 'one'
                      ? 'home.hosts.summary.direct.one'
                      : 'home.hosts.summary.direct.other',
                    { count: String(direct.length) },
                  ),
                bastions.length > 0 &&
                  i18n.t(
                    i18n.plural(bastions.length) === 'one'
                      ? 'home.hosts.summary.bastions.one'
                      : 'home.hosts.summary.bastions.other',
                    { count: String(bastions.length) },
                  ),
              ]
                .filter((part): part is string => part !== false)
                .join(', ')}
            </span>
          )}
        </div>
      </div>

      <div className="border-line-subtle flex max-w-[420px] items-center justify-between gap-3 border-t pt-4">
        <span className="text-ink-secondary text-[12.5px]">
          {i18n.t(
            i18n.plural(macros.length) === 'one' ? 'home.macros.summary.one' : 'home.macros.summary.other',
            { count: String(macros.length) },
          )}
        </span>
        <button
          type="button"
          onClick={onOpenMacros}
          className="text-accent shrink-0 text-[12px] font-semibold hover:underline"
        >
          {i18n.t('home.macros.summary.manage')}
        </button>
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
                <li key={live.session.id}>
                  <button
                    type="button"
                    onClick={() => onActivateSession(live.session.id)}
                    aria-label={i18n.t('home.hosts.summary.open', { name: label.name })}
                    className="hover:bg-surface-raised/50 flex w-full items-center gap-2.5 rounded px-1 py-1.5 text-left"
                  >
                    <SessionMarker kind={live.kind} />
                    <span className="text-ink-secondary min-w-0 flex-1 truncate text-[12.5px]">{label.name}</span>
                    <span className="text-ink-faint shrink-0 truncate font-mono text-[10.5px]">{label.where}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
