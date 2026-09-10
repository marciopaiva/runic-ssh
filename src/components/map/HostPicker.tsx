import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import type { ComponentKind, Session } from '../../ipc';
import type { AddRefusal } from '../../features/map';
import { useTranslator } from '../../features/settings';

import { SessionSurface, SurfaceAction } from '../SessionSurface';

interface HostPickerProps {
  readonly kind: ComponentKind;
  /** Whether a component is being pointed elsewhere rather than created. */
  readonly changing: boolean;
  readonly hosts: readonly Session[];
  /** Why the last choice was refused, if it was. */
  readonly refusal: AddRefusal | null;
  readonly onPick: (sessionId: string) => void;
  /** Registers a new host in Home's own editor, the only path a host gets
      a credential through (ADR-0034); the map then points at it. */
  readonly onNewHost: (name: string) => void;
  readonly onClose: () => void;
}

/**
 * Which saved host a component opens on.
 *
 * A list of the book with a filter, and the two ways out when the host is
 * not there: the action at the bottom and the row that appears when the
 * filter finds nothing, both of which take the typed name to Home's editor.
 * Drawn as a `SessionSurface` over the map, the same card every other
 * question in the application is asked on (ADR-0015).
 */
export function HostPicker({ kind, changing, hosts, refusal, onPick, onNewHost, onClose }: HostPickerProps): JSX.Element {
  const i18n = useTranslator();
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...hosts].sort((a, b) => a.name.localeCompare(b.name));
    if (needle === '') return sorted;
    return sorted.filter((host) => `${host.name} ${host.host} ${host.user}`.toLowerCase().includes(needle));
  }, [hosts, query]);

  const byId = useMemo(() => new Map(hosts.map((host) => [host.id, host])), [hosts]);
  const kindLabel = i18n.t(kind === 'ssh' ? 'map.create.ssh' : kind === 'sftp' ? 'map.create.sftp' : 'map.create.monitor');
  const title = changing
    ? i18n.t('map.picker.title.change')
    : i18n.t(kind === 'ssh' ? 'map.picker.title.ssh' : kind === 'sftp' ? 'map.picker.title.sftp' : 'map.picker.title.monitor');

  return (
    <div
      className="absolute inset-0 z-[400] flex items-center justify-center"
      style={{ background: 'var(--rs-glass-panel)' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="w-[460px] max-w-full">
        <SessionSurface
          titleId="map-host-picker-title"
          title={title}
          body={i18n.t('map.picker.body')}
          note={
            refusal === null ? undefined : (
              <span className="text-warn text-[11.5px]">
                {refusal.reason === 'duplicate'
                  ? i18n.t('map.picker.duplicate', {
                      name: byId.get(refusal.existing.host)?.name ?? refusal.existing.host,
                      kind: kindLabel,
                    })
                  : i18n.t('map.empty.body')}
              </span>
            )
          }
          actions={
            <>
              <SurfaceAction variant="secondary" onClick={() => onNewHost(query.trim())}>
                {i18n.t('map.picker.newHost')}
              </SurfaceAction>
              <SurfaceAction variant="secondary" onClick={onClose}>
                {i18n.t('hostKey.action.cancel')}
              </SurfaceAction>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const first = shown[0];
                if (first !== undefined) onPick(first.id);
                else if (query.trim() !== '') onNewHost(query.trim());
              }}
              placeholder={i18n.t('map.picker.filter', { count: String(hosts.length) })}
              aria-label={i18n.t('map.picker.filter', { count: String(hosts.length) })}
              className="bg-surface-input border-line-subtle focus:border-accent text-ink h-[30px] rounded border px-2.5 text-[12.5px] outline-none"
            />
            <div className="border-line-subtle flex max-h-[300px] flex-col overflow-auto rounded border" role="listbox">
              {shown.map((host) => (
                <button
                  key={host.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="border-line-subtle hover:bg-surface-raised flex h-[30px] items-center gap-2.5 border-b px-2.5 text-left last:border-b-0"
                  onClick={() => onPick(host.id)}
                >
                  <span className="text-ink text-[12px]">{host.name}</span>
                  {typeof host.proxyJump === 'string' && (
                    <span className="text-ink-faint text-[10.5px]">
                      {i18n.t('map.picker.via', { name: byId.get(host.proxyJump)?.name ?? host.proxyJump })}
                    </span>
                  )}
                  <span className="text-ink-faint ml-auto font-mono text-[10.5px]">
                    {host.user}@{host.host}
                  </span>
                </button>
              ))}
              {shown.length === 0 && query.trim() !== '' && (
                <button
                  type="button"
                  className="text-accent-bright hover:bg-surface-raised flex h-[30px] items-center px-2.5 text-left text-[12px]"
                  onClick={() => onNewHost(query.trim())}
                >
                  {i18n.t('map.picker.register', { name: query.trim() })}
                </button>
              )}
            </div>
          </div>
        </SessionSurface>
      </div>
    </div>
  );
}
