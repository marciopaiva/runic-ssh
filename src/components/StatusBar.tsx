import type { JSX } from 'react';

import type { ConnectionKind } from '../features/sessions';
import { describeState } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { ENCODING, TERM, gradeLatency, paletteKeys } from '../features/status';
import type { TerminalSize } from '../features/terminal/use-terminal';
import type { PaneLabel } from '../features/terminal/layout';
import type { CommandModifier, SessionStats } from '../ipc';

import { SessionMarker } from './SessionMarker';

interface StatusBarProps {
  /** `null` when no session is open. */
  readonly kind: ConnectionKind | null;
  /** Identity of the focused session, when one is focused. */
  readonly identity: PaneLabel | null;
  readonly stats: SessionStats;
  readonly size: TerminalSize | null;
  readonly modifier: CommandModifier;
  /** How many hosts a keystroke reaches, or `null` when it reaches one. */
  readonly syncing: number | null;
  readonly onStopSync: () => void;
}

/** A cell, so every item on the bar has the same padding and no more. */
function Cell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: JSX.Element | string;
}): JSX.Element {
  return (
    <div title={title} className="flex shrink-0 items-center gap-1.5 px-3">
      {children}
    </div>
  );
}

function Sep(): JSX.Element {
  return <span className="bg-line-subtle mx-0.5 h-3.5 w-px shrink-0" aria-hidden="true" />;
}

/**
 * Signal bars for the round trip.
 *
 * Three bars, filled by grade, so the reading survives greyscale and reaches
 * someone who cannot separate the red from the green — the same rule the
 * sidebar markers follow. The colour is the second signal.
 */
function LatencyBars({ filled }: { readonly filled: number }): JSX.Element {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[4, 6, 8].map((height, index) => (
        <span
          key={height}
          style={{ height: `${height}px` }}
          className={`w-[2.5px] rounded-[1px] ${
            index < filled ? 'bg-current' : 'bg-current opacity-25'
          }`}
        />
      ))}
    </span>
  );
}

/**
 * The bar along the bottom.
 *
 * Layout follows the mockup: identity next to connection state, latency in
 * accent, transfer as a pair, and a loud disarm control when broadcast is
 * armed. Encoding / term / size stay on the trailing edge as secondary facts.
 */
export function StatusBar({
  kind,
  identity,
  stats,
  size,
  modifier,
  syncing,
  onStopSync,
}: StatusBarProps): JSX.Element {
  const i18n = useTranslator();
  const latency = gradeLatency(stats.latencyMs);
  const down = i18n.bytes(stats.fromHost);
  const up = i18n.bytes(stats.toHost);

  return (
    <footer
      aria-label={i18n.t('status.state')}
      className="bg-surface-chrome border-line-subtle text-ink-muted flex h-8 shrink-0 items-center border-t text-[11.5px]"
    >
      <Cell title={i18n.t('status.state')}>
        <>
          {kind === null ? (
            <span className="text-ink-faint">{i18n.t('status.idle')}</span>
          ) : (
            <>
              <SessionMarker kind={kind} />
              <span className="text-ink font-semibold">
                {i18n.t(describeState(kind).label)}
              </span>
            </>
          )}
        </>
      </Cell>

      {identity !== null && (
        <>
          <Sep />
          <Cell title={`${identity.name} · ${identity.where}`}>
            <>
              <span className="text-ink max-w-[9rem] truncate font-semibold">
                {identity.name}
              </span>
              <span className="text-ink-faint max-w-[12rem] truncate font-mono">
                {identity.where}
              </span>
            </>
          </Cell>
        </>
      )}

      <Sep />

      <Cell title={i18n.t(latency.label)}>
        <>
          <span className={latency.tone}>
            <LatencyBars filled={latency.bars} />
          </span>
          <span className={`font-mono font-medium ${latency.tone}`}>
            {stats.latencyMs === null
              ? '—'
              : i18n.number(stats.latencyMs, {
                  style: 'unit',
                  unit: 'millisecond',
                  unitDisplay: 'short',
                  maximumFractionDigits: 0,
                })}
          </span>
        </>
      </Cell>

      <Sep />

      <Cell title={i18n.t('status.transfer', { down, up })}>
        <>
          <svg viewBox="0 0 16 16" className="text-accent-bright h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M5 3.5v9M2.5 10l2.5 2.5L7.5 10M11 12.5v-9M8.5 6L11 3.5 13.5 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-ink-secondary font-mono">
            ↑ {up}
          </span>
          <span className="text-ink-secondary font-mono">
            ↓ {down}
          </span>
        </>
      </Cell>

      {syncing !== null && (
        <>
          <Sep />
          <button
            type="button"
            onClick={onStopSync}
            title={i18n.t('command.split.sync.off')}
            className="bg-warn text-surface-base my-1 ml-1 flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 font-mono text-[11px] font-bold shadow-sm"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path
                d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {i18n.t('status.sync.on', { count: String(syncing) })}
          </button>
        </>
      )}

      <span className="flex-1" />

      <Cell title={i18n.t('status.encoding')}>
        <span className="font-mono">{ENCODING}</span>
      </Cell>

      <Sep />

      <Cell title={i18n.t('status.term')}>
        <span className="font-mono">{TERM}</span>
      </Cell>

      <Sep />

      <Cell title={i18n.t('status.size')}>
        <span className="text-ink-secondary font-mono font-medium">
          {size === null
            ? '—'
            : `${i18n.number(size.columns)} × ${i18n.number(size.rows)}`}
        </span>
      </Cell>

      <Sep />

      <div className="text-ink-secondary flex shrink-0 items-center gap-1.5 pr-4 pl-2">
        <span className="flex items-center gap-1">
          {paletteKeys(modifier).map((key) => (
            <kbd
              key={key}
              className="border-line-strong bg-surface-raised rounded-[4px] border px-1.5 py-[2px] font-mono text-[10px]"
            >
              {key}
            </kbd>
          ))}
        </span>
        <span className="text-ink-faint">{i18n.t('status.palette')}</span>
      </div>
    </footer>
  );
}
