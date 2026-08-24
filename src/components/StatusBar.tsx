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
      {[3, 5, 7].map((height, index) => (
        <span
          key={height}
          style={{ height: `${height}px` }}
          className={`w-[2px] rounded-[1px] ${
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
 * Everything on it is measured except the palette hint. The two numbers come
 * from the core — bytes counted as they pass through the pump, and a round trip
 * timed against the host — and the size is whatever the remote pty was last
 * told. The encoding and the terminal type are constants, shown because they
 * answer a question people ask of an SSH client, not because they are settings.
 *
 * When a session is focused the identity cell sits immediately after the state
 * marker so the eye that is already looking at the green/yellow/red also sees
 * *which* host it refers to. With four panes the shell prompt is otherwise the
 * only clue, and remote PS1 is not under our control.
 *
 * The broadcast button is the loudest thing on the bar on purpose: when armed,
 * typing reaches more than one host, and turning it off must never cost a search.
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
      className="bg-surface-chrome border-line-subtle text-ink-muted flex h-[27px] shrink-0 items-stretch border-t text-[11.5px]"
    >
      <Cell title={i18n.t('status.state')}>
        <>
          {kind === null ? (
            <span className="text-ink-faint">{i18n.t('status.idle')}</span>
          ) : (
            <>
              <SessionMarker kind={kind} />
              <span className="text-ink-secondary font-semibold">
                {i18n.t(describeState(kind).label)}
              </span>
            </>
          )}
        </>
      </Cell>

      {identity !== null && (
        <Cell title={`${identity.name} · ${identity.where}`}>
          <>
            <span className="text-ink-secondary max-w-[9rem] truncate font-semibold">
              {identity.name}
            </span>
            <span className="text-ink-faint max-w-[11rem] truncate font-mono">
              {identity.where}
            </span>
          </>
        </Cell>
      )}

      <Cell title={i18n.t(latency.label)}>
        <>
          <span className={latency.tone}>
            <LatencyBars filled={latency.bars} />
          </span>
          <span className="font-mono">
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

      <Cell title={i18n.t('status.transfer', { down, up })}>
        <>
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M5 3.5v9M2.5 10l2.5 2.5L7.5 10M11 12.5v-9M8.5 6L11 3.5 13.5 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-mono">
            {down} / {up}
          </span>
        </>
      </Cell>

      {/* The only thing on screen saying that what you type leaves this pane,
          and the bar is where it belongs: it is true of the window rather than
          of any one terminal. Loud on purpose, and a button rather than a
          label, because turning it off should never cost a search. */}
      {syncing !== null && (
        <button
          type="button"
          onClick={onStopSync}
          title={i18n.t('command.split.sync.off')}
          className="bg-warn-soft text-warn border-warn my-0.5 flex shrink-0 items-center gap-1.5 rounded border-2 px-2.5 font-mono text-[12px] font-bold shadow-[0_0_0_1px_var(--color-warn)]"
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
      )}

      <span className="flex-1" />

      <Cell title={i18n.t('status.encoding')}>
        <span className="font-mono">{ENCODING}</span>
      </Cell>

      <Cell title={i18n.t('status.term')}>
        <span className="font-mono">{TERM}</span>
      </Cell>

      <Cell title={i18n.t('status.size')}>
        <span className="font-mono">
          {size === null
            ? '—'
            : `${i18n.number(size.columns)} × ${i18n.number(size.rows)}`}
        </span>
      </Cell>

      <div className="text-ink-secondary flex shrink-0 items-center gap-1.5 pr-4 pl-3">
        <span className="flex items-center gap-1">
          {paletteKeys(modifier).map((key) => (
            <kbd
              key={key}
              className="border-line-strong rounded-[3px] border px-1 py-[1px] font-mono text-[10px]"
            >
              {key}
            </kbd>
          ))}
        </span>
        <span>{i18n.t('status.palette')}</span>
      </div>
    </footer>
  );
}
