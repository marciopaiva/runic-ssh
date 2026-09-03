import type { JSX } from 'react';

import type { ConnectionKind } from '../features/sessions';
import { describeState, FORWARD_KIND_LABEL } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { ENCODING, FORWARD_STATE_LABEL, TERM, anyForwardFailed, gradeLatency, paletteKeys } from '../features/status';
import type { Announcement, ForwardStatus } from '../features/status';
import type { GroupLabel } from '../features/terminal';
import type { TerminalSize } from '../features/terminal/use-terminal';
import type { CommandModifier, SessionStats } from '../ipc';

import { SessionMarker } from './SessionMarker';

interface StatusBarProps {
  /** `null` when no session is open. */
  readonly kind: ConnectionKind | null;
  /** What the focused session is called, or `null` when a tab is not one. */
  readonly identity: GroupLabel | null;
  readonly stats: SessionStats;
  readonly size: TerminalSize | null;
  readonly modifier: CommandModifier;
  /** How many hosts a keystroke reaches, or `null` when it reaches one. */
  readonly syncing: number | null;
  /**
   * What to say out loud about that, or `null` before it has ever changed.
   *
   * Separate from `syncing` because a live region announces a change to text
   * it already held, and every marker for this state comes and goes with the
   * state itself. See `features/status/broadcast.ts` and #154.
   */
  readonly announcement: Announcement | null;
  /**
   * A credential this session needed that the keychain refused, or `null`.
   *
   * Here rather than over the terminal because the fact stays true for the
   * life of the session, and a strip above the panel would push the terminal
   * down and make it refit for a message. See #167.
   *
   * `via` names the jump host when the refusal was at that hop. It is a host
   * with no tab, and it is reported here because the user reached it on the
   * way to the session they are looking at, which is how a failure in a chain
   * is already reported. See #191.
   */
  readonly credentialUnsaved: { readonly via: string | null; readonly usesVault: boolean } | null;
  /**
   * The host this session's traffic travels through, or `null` when none.
   *
   * A bastion has no tab and no terminal, so this cell is the only place the
   * window says where a chained session actually goes. The sidebar answers
   * "what is open"; this answers "where does this go", and they are different
   * questions about the same connection. See #168.
   */
  readonly via: string | null;
  readonly onDismissUnsaved: () => void;
  /**
   * This session's own saved forwards (ADR-0054), started the moment it
   * connected. Empty for a session with none saved, which is most of them.
   */
  readonly forwards: readonly ForwardStatus[];
  /**
   * The running build's version, shown in place of the encoding/terminal/size
   * cells while Home is the active workspace. Those three describe a session,
   * and Home has none open; a version is the one fact about "what is running"
   * that is still true there. `null` on Sessions, where the session cells
   * already answer that question.
   */
  readonly buildVersion: string | null;
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
 */
export function StatusBar({
  kind,
  identity,
  stats,
  size,
  modifier,
  syncing,
  announcement,
  credentialUnsaved,
  via,
  onDismissUnsaved,
  forwards,
  buildVersion,
}: StatusBarProps): JSX.Element {
  const i18n = useTranslator();
  const latency = gradeLatency(stats.latencyMs);
  const down = i18n.bytes(stats.fromHost);
  const up = i18n.bytes(stats.toHost);
  const forwardsFailed = anyForwardFailed(forwards);
  const forwardsTitle = forwards
    .map(
      (status) =>
        `${i18n.t(FORWARD_KIND_LABEL[status.forward.kind])} ${status.forward.bindPort}: ${i18n.t(FORWARD_STATE_LABEL[status.runtime.kind])}`,
    )
    .join('\n');

  return (
    <footer
      aria-label={i18n.t('status.state')}
      /* The whole top edge, not a badge on it. ADR-0020 asks for the bar
         itself to say that typing is leaving this pane, because a marker
         somewhere on a bar is something the eye learns to stop seeing and an
         edge across the window is not. */
      className={`bg-surface-chrome text-ink-muted flex h-[27px] shrink-0 items-stretch text-[11.5px] ${
        syncing === null ? 'border-line-subtle border-t' : 'border-warn border-t-2'
      }`}
    >
      {/* Always rendered, never conditional: a live region that arrives
          already holding its text is not reliably announced, and the badge
          below is inserted and removed with the fact it describes, so
          disarming used to say nothing at all. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement === null
          ? ''
          : i18n.t(announcement.key, { count: String(announcement.count) })}
      </p>

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

      {/* Which host the rest of this bar is about. The same label a tab
          carries, from the same helper, so the two cannot come to call one
          session by two names. Without it the bar reads as facts about
          nothing in particular, which is fine with one terminal and stops
          being fine the moment four are on screen. */}
      {identity !== null && (
        <Cell title={`${identity.name} ${identity.where}`}>
          <>
            <span className="text-ink-secondary max-w-[160px] truncate font-semibold">
              {identity.name}
            </span>
            <span className="text-ink-faint max-w-[200px] truncate font-mono">
              {identity.where}
            </span>
          </>
        </Cell>
      )}

      {/* Beside the host this bar is about, because it qualifies it: the name
          on the left is where the keystrokes end up, and this is the machine
          they cross to get there. */}
      {via !== null && (
        <Cell title={i18n.t('status.via', { host: via })}>
          <>
            <svg viewBox="0 0 16 16" className="text-accent h-3 w-3" fill="none" aria-hidden="true">
              {/* The same turn the sidebar draws on a host that rides another,
                  so one glyph means one thing in both places. */}
              <path
                d="M3.5 2.5v7a2.5 2.5 0 0 0 2.5 2.5h6.5M10 9l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-ink-secondary max-w-[160px] truncate">{via}</span>
          </>
        </Cell>
      )}

      {/* Only when this session has saved forwards, the same "nothing to
          say" reasoning `via` above already follows. Warn-tinted the moment
          one of them failed to start, the same tone `syncing` below already
          uses for "worth a look", rather than a colour of its own for a
          third meaning. The tooltip is where each one's own state actually
          reads, the same `title` every other cell on this bar already
          answers a hover with. */}
      {forwards.length > 0 && (
        <Cell title={`${i18n.t('status.forwards')}\n${forwardsTitle}`}>
          <>
            <svg
              viewBox="0 0 16 16"
              className={`h-3 w-3 ${forwardsFailed ? 'text-warn' : 'text-ink-faint'}`}
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 4v8M13 4v8M6 8h4M8 6l2 2-2 2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={`font-mono ${forwardsFailed ? 'text-warn' : ''}`}>{forwards.length}</span>
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

      {/* What the bar is good at: saying how many hosts are on the receiving
          end, beside the whole top edge turning warn. The thing you press
          moved to the top strip with ADR-0021's argument, which is that a
          switch about the window belongs to the surface that is the window
          rather than among readings that are measurements. */}
      {/* Said once the session is already open, so it is never in the way of
          connecting. Dismissible because there is nothing to act on: the
          secret is gone, correctly, and the next connection will ask again. */}
      {credentialUnsaved !== null && (
        <button
          type="button"
          onClick={onDismissUnsaved}
          title={
            credentialUnsaved.via === null
              ? i18n.t(
                  credentialUnsaved.usesVault
                    ? 'status.credentialUnsaved.detail.vault'
                    : 'status.credentialUnsaved.detail',
                )
              : i18n.t(
                  credentialUnsaved.usesVault
                    ? 'status.credentialUnsaved.detail.via.vault'
                    : 'status.credentialUnsaved.detail.via',
                  { host: credentialUnsaved.via },
                )
          }
          className="text-ink-secondary border-line-subtle hover:text-ink my-1 flex shrink-0 items-center gap-1.5 rounded border px-2"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* The badge says which of the two it was, rather than leaving the
              difference in the title where it takes a hover to find. Both
              refusals read identically at a glance otherwise, and the one
              about a host with no tab is the one that needs naming. */}
          {i18n.t(
            credentialUnsaved.via === null
              ? 'status.credentialUnsaved'
              : 'status.credentialUnsaved.via',
          )}
        </button>
      )}

      {syncing !== null && (
        <div
          /* Not a live region any more. It said the same thing as the region
             above and only half the time, and two of them announce twice. */
          title={i18n.t('command.split.sync.detail', { count: String(syncing) })}
          className="bg-warn-soft text-warn border-warn/40 my-1 flex shrink-0 items-center gap-1.5 rounded border px-2 font-mono font-semibold"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
            <path
              d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {i18n.t('status.sync.on', { count: String(syncing) })}
        </div>
      )}

      <span className="flex-1" />

      {buildVersion !== null ? (
        <Cell title={i18n.t('status.version')}>
          <span className="font-mono">{i18n.t('status.version.value', { version: buildVersion })}</span>
        </Cell>
      ) : (
        <>
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
        </>
      )}

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
