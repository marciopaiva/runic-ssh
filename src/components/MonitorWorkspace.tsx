import { useState } from 'react';
import type { JSX } from 'react';

import {
  filterProcesses,
  filterUnits,
  meterTone,
  niceMax,
  sortProcesses,
  unitTone,
  useProcesses,
  useStatsHistory,
  useSystemdUnits,
  useSystemInfo,
} from '../features/monitor';
import type { MeterTone, ProcessSort, Sample, UnitTone } from '../features/monitor';
import { useTranslator } from '../features/settings';
import { formatUptime } from '../features/status';
import type { GroupLabel } from '../features/terminal';
import type { Filesystem, Process, SessionHandle, SystemdUnit, SystemStats } from '../ipc';

interface MonitorWorkspaceProps {
  readonly identity: GroupLabel;
  readonly handle: SessionHandle;
  readonly stats: SystemStats;
}

type DetailTab = 'home' | 'processes' | 'systemd';

/* `as const satisfies` rather than an annotated `Record<DetailTab, string>`:
   an explicit `string` annotation would widen each value past the literal
   key `i18n.t` needs to resolve whether a message takes parameters. */
const TAB_LABEL = {
  home: 'monitor.tab.home',
  processes: 'monitor.tab.processes',
  systemd: 'monitor.tab.systemd',
} as const satisfies Record<DetailTab, string>;

/**
 * A reading over the last few minutes, as a filled area chart: the shape
 * every monitoring tool a sysadmin already knows draws exactly this reading
 * as, axis and gridlines included. No charting library: a handful of SVG
 * primitives is the whole of what one series over a fixed ceiling needs.
 *
 * Axis labels live beside the chart as ordinary text, not inside the scaled
 * SVG: `preserveAspectRatio="none"` stretches the chart to the width it is
 * given, and text stretched the same way reads as squashed or smeared
 * rather than as a number.
 */
function AreaChart({
  samples,
  max,
  formatValue,
}: {
  readonly samples: readonly Sample[];
  readonly max: number;
  readonly formatValue: (value: number) => string;
}): JSX.Element {
  const width = 300;
  const height = 64;
  const y = (value: number): number => height - (Math.min(max, Math.max(0, value)) / max) * height;

  const chart =
    samples.length < 2 ? (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 flex-1" aria-hidden="true" />
    ) : (
      (() => {
        const step = width / (samples.length - 1);
        const line = samples.map((sample, index) => `${index * step},${y(sample.value)}`).join(' ');
        const area = `0,${height} ${line} ${width},${height}`;

        return (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="text-accent h-16 flex-1"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line x1={0} x2={width} y1={y(max / 2)} y2={y(max / 2)} className="stroke-line-subtle" strokeWidth={1} />
            <line x1={0} x2={width} y1={y(max)} y2={y(max)} className="stroke-line-subtle" strokeWidth={1} />
            <polygon points={area} className="fill-accent-soft" />
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      })()
    );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        <div className="text-ink-faint flex w-8 shrink-0 flex-col justify-between py-0.5 text-right text-[9px] tabular-nums">
          <span>{formatValue(max)}</span>
          <span>{formatValue(max / 2)}</span>
          <span>{formatValue(0)}</span>
        </div>
        {chart}
      </div>
      {samples.length >= 2 && (
        <div className="text-ink-faint flex justify-between pl-[38px] text-[9.5px]">
          <span>{clockTime(samples[0]?.at ?? 0)}</span>
          <span>{clockTime(samples[samples.length - 1]?.at ?? 0)}</span>
        </div>
      )}
    </div>
  );
}

function clockTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
}

/**
 * `i18n.bytes` already formats a byte count for the locale (`2.4 MB`); "/s"
 * is a unit suffix, not prose, the same reason `ms` and `kB` stay
 * untranslated everywhere else in this app.
 */
function formatRate(bytesPerSec: number, i18n: ReturnType<typeof useTranslator>): string {
  return `${i18n.bytes(bytesPerSec)}/s`;
}

function MetricCard({
  title,
  value,
  samples,
  max,
  formatValue,
}: {
  readonly title: string;
  readonly value: string;
  readonly samples: readonly Sample[];
  readonly max: number;
  readonly formatValue: (value: number) => string;
}): JSX.Element {
  return (
    <div className="border-line-subtle bg-surface-chrome flex flex-col gap-2 rounded border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-secondary text-[12px] font-semibold">{title}</span>
        <span className="text-ink font-mono text-[15px] font-semibold">{value}</span>
      </div>
      <AreaChart samples={samples} max={max} formatValue={formatValue} />
    </div>
  );
}

const UNIT_TONE_FILL: Readonly<Record<UnitTone, string>> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  muted: 'bg-ink-faint',
};

function UnitRow({ unit }: { readonly unit: SystemdUnit }): JSX.Element {
  const tone = unitTone(unit);
  return (
    <div className="border-line-subtle flex items-center gap-2.5 border-b px-3 py-1.5">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${UNIT_TONE_FILL[tone]}`}
        title={`${unit.active}/${unit.sub}`}
      />
      <span className="text-ink-secondary max-w-[220px] shrink-0 truncate font-mono text-[11.5px]">
        {unit.name}
      </span>
      <span className="text-ink-faint truncate text-[11.5px]">{unit.description}</span>
    </div>
  );
}

function SystemdTab({ handle, active }: { readonly handle: SessionHandle; readonly active: boolean }): JSX.Element {
  const i18n = useTranslator();
  const units = useSystemdUnits(active ? handle : null);
  const [query, setQuery] = useState('');
  const filtered = filterUnits(units, query);

  return (
    <div className="flex h-full flex-col">
      <div className="border-line-subtle border-b p-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n.t('monitor.systemd.filter')}
          className="bg-surface-base border-line-subtle text-ink w-full rounded border px-2 py-1 text-[12px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-ink-faint p-3 text-[12px]">
            {units.length === 0 ? i18n.t('monitor.systemd.none') : i18n.t('monitor.systemd.noMatch')}
          </p>
        ) : (
          filtered.map((unit) => <UnitRow key={unit.name} unit={unit} />)
        )}
      </div>
    </div>
  );
}

function ProcessRow({
  process,
  i18n,
}: {
  readonly process: Process;
  readonly i18n: ReturnType<typeof useTranslator>;
}): JSX.Element {
  const percent = (value: number): string =>
    i18n.number(value / 100, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <div className="border-line-subtle flex items-center gap-2.5 border-b px-3 py-1.5">
      <span className="text-ink-faint w-12 shrink-0 text-right font-mono text-[11px]">{process.pid}</span>
      <span className="text-ink-secondary w-20 shrink-0 truncate font-mono text-[11.5px]">{process.user}</span>
      <span className="text-ink w-12 shrink-0 text-right font-mono text-[11.5px]">
        {percent(process.cpuPercent)}
      </span>
      <span className="text-ink w-12 shrink-0 text-right font-mono text-[11.5px]">
        {percent(process.memPercent)}
      </span>
      <span className="text-ink-faint truncate font-mono text-[11.5px]">{process.command}</span>
    </div>
  );
}

/**
 * The host's own busiest processes, sorted by CPU or memory: clicking one
 * of the two column headers re-sorts the list already on screen rather
 * than asking the host again, since `ssh::processes::command` already
 * reads both columns in one poll.
 */
function ProcessesTab({ handle, active }: { readonly handle: SessionHandle; readonly active: boolean }): JSX.Element {
  const i18n = useTranslator();
  const processes = useProcesses(active ? handle : null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProcessSort>('cpu');
  const filtered = sortProcesses(filterProcesses(processes, query), sort);

  const sortButton = (candidate: ProcessSort, label: string): JSX.Element => (
    <button
      type="button"
      onClick={() => setSort(candidate)}
      className={`w-12 shrink-0 text-right ${sort === candidate ? 'text-ink' : 'hover:text-ink-secondary'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-line-subtle border-b p-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n.t('monitor.processes.filter')}
          className="bg-surface-base border-line-subtle text-ink w-full rounded border px-2 py-1 text-[12px]"
        />
      </div>
      <div className="border-line-subtle text-ink-faint flex items-center gap-2.5 border-b px-3 py-1 text-[10.5px] font-semibold tracking-wide uppercase">
        <span className="w-12 shrink-0 text-right">{i18n.t('monitor.processes.pid')}</span>
        <span className="w-20 shrink-0">{i18n.t('monitor.processes.user')}</span>
        {sortButton('cpu', i18n.t('monitor.processes.cpu'))}
        {sortButton('mem', i18n.t('monitor.processes.mem'))}
        <span className="flex-1">{i18n.t('monitor.processes.command')}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-ink-faint p-3 text-[12px]">
            {processes.length === 0 ? i18n.t('monitor.processes.none') : i18n.t('monitor.processes.noMatch')}
          </p>
        ) : (
          filtered.map((process) => <ProcessRow key={process.pid} process={process} i18n={i18n} />)
        )}
      </div>
    </div>
  );
}

/**
 * A generic machine glyph, deliberately not a distro logo.
 *
 * GNOME's own System Monitor draws the running distribution's actual mark,
 * pulled from the desktop's icon theme. This project has no icon theme to
 * borrow from, and hand-drawing a specific distribution's mark (Debian's
 * swirl, Ubuntu's ring of dots) would mean redrawing a trademark rather
 * than an interface glyph, for however many distributions this would need
 * to recognize. One neutral mark, the same drawn style as the rest of the
 * app's icons, says "a machine" without claiming to be anyone's logo.
 */
function SystemGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="text-ink-faint h-8 w-8 shrink-0" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.5 8h5M6.5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SystemInfoCard({ handle }: { readonly handle: SessionHandle }): JSX.Element | null {
  const i18n = useTranslator();
  const info = useSystemInfo(handle);

  if (info.osName === null && info.kernel === null && info.hostname === null && info.cpuModel === null) {
    return null;
  }

  return (
    <div className="border-line-subtle bg-surface-chrome flex items-start gap-3 rounded border p-3">
      <SystemGlyph />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-ink truncate text-[13px] font-semibold">
          {info.osName ?? i18n.t('monitor.system.unknown')}
        </span>
        <div className="flex flex-col gap-0.5">
          {info.hostname !== null && (
            <span className="text-ink-faint font-mono text-[11px]">{info.hostname}</span>
          )}
          {info.kernel !== null && <span className="text-ink-faint font-mono text-[11px]">{info.kernel}</span>}
          {info.cpuModel !== null && (
            <span className="text-ink-faint truncate text-[11px]">{info.cpuModel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function UptimeCard({
  uptimeSeconds,
  i18n,
}: {
  readonly uptimeSeconds: number;
  readonly i18n: ReturnType<typeof useTranslator>;
}): JSX.Element {
  return (
    <div className="border-line-subtle bg-surface-chrome flex shrink-0 flex-col justify-center gap-1 rounded border p-3 sm:w-40">
      <span className="text-ink-faint text-[11px]">{i18n.t('status.monitor.uptime')}</span>
      <span className="text-ink font-mono text-[15px] font-semibold">{formatUptime(uptimeSeconds, i18n)}</span>
    </div>
  );
}

const FS_BAR_FILL: Readonly<Record<MeterTone, string>> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

function FilesystemRow({ filesystem, i18n }: { readonly filesystem: Filesystem; readonly i18n: ReturnType<typeof useTranslator> }): JSX.Element {
  const percent = (filesystem.usage.usedKb / filesystem.usage.totalKb) * 100;
  const tone = meterTone(percent);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-secondary truncate font-mono text-[11.5px]">{filesystem.mount}</span>
        <span className="text-ink-faint shrink-0 font-mono text-[11px]">
          {i18n.bytes(filesystem.usage.usedKb * 1024)} / {i18n.bytes(filesystem.usage.totalKb * 1024)}
        </span>
      </div>
      <div className="bg-surface-raised h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${FS_BAR_FILL[tone]}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Every mounted filesystem, not only the root: a table rather than a
 * `MetricCard`, since there can be more than one number to trend and a
 * chart has nowhere to put a second mount point. `ssh/monitor.rs` already
 * filtered out the pseudo-filesystems (`proc`, `cgroup`, device nodes); a
 * host reporting none at all (an unreadable `df`, or genuinely nothing
 * left after filtering) renders nothing rather than an empty card.
 */
function FilesystemsCard({ filesystems }: { readonly filesystems: readonly Filesystem[] }): JSX.Element | null {
  const i18n = useTranslator();

  if (filesystems.length === 0) return null;

  return (
    <div className="border-line-subtle bg-surface-chrome flex flex-col gap-2.5 rounded border p-3">
      <span className="text-ink-secondary text-[12px] font-semibold">{i18n.t('monitor.filesystems')}</span>
      <div className="flex flex-col gap-2.5">
        {filesystems.map((filesystem) => (
          <FilesystemRow key={filesystem.mount} filesystem={filesystem} i18n={i18n} />
        ))}
      </div>
    </div>
  );
}

function HomeTab({ handle, stats }: { readonly handle: SessionHandle; readonly stats: SystemStats }): JSX.Element {
  const i18n = useTranslator();
  const history = useStatsHistory(handle, stats);

  const percentValue = (value: number | null): string =>
    value === null ? '—' : i18n.number(value / 100, { style: 'percent', maximumFractionDigits: 0 });
  const formatPercentAxis = (value: number): string =>
    i18n.number(value / 100, { style: 'percent', maximumFractionDigits: 0 });
  const loadPeak = Math.max(1, ...history.loadAverage.map((sample) => sample.value));
  const loadMax = niceMax(loadPeak);
  const networkPeak = Math.max(1, ...history.networkBytesPerSec.map((sample) => sample.value));
  const networkMax = niceMax(networkPeak);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <SystemInfoCard handle={handle} />
          </div>
          {stats.uptimeSeconds !== null && <UptimeCard uptimeSeconds={stats.uptimeSeconds} i18n={i18n} />}
        </div>

        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
          <MetricCard
            title={i18n.t('status.monitor.cpu')}
            value={percentValue(stats.cpuPercent)}
            samples={history.cpu}
            max={100}
            formatValue={formatPercentAxis}
          />

          <MetricCard
            title={i18n.t('status.monitor.memory')}
            value={
              stats.memory === null
                ? '—'
                : i18n.number(stats.memory.usedKb / stats.memory.totalKb, {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  })
            }
            samples={history.ramPercent}
            max={100}
            formatValue={formatPercentAxis}
          />

          {stats.swap !== null && stats.swap.totalKb > 0 && (
            <MetricCard
              title={i18n.t('status.monitor.swap')}
              value={i18n.number(stats.swap.usedKb / stats.swap.totalKb, {
                style: 'percent',
                maximumFractionDigits: 0,
              })}
              samples={history.swapPercent}
              max={100}
              formatValue={formatPercentAxis}
            />
          )}

          {stats.disk !== null && (
            <MetricCard
              title={i18n.t('status.monitor.disk')}
              value={i18n.number(stats.disk.usedKb / stats.disk.totalKb, {
                style: 'percent',
                maximumFractionDigits: 0,
              })}
              samples={history.diskPercent}
              max={100}
              formatValue={formatPercentAxis}
            />
          )}

          {stats.loadAverage !== null && (
            <MetricCard
              title={i18n.t('status.monitor.load')}
              value={i18n.number(stats.loadAverage.one, { maximumFractionDigits: 2 })}
              samples={history.loadAverage}
              max={loadMax}
              formatValue={(value) => i18n.number(value, { maximumFractionDigits: 2 })}
            />
          )}

          {stats.network !== null && (
            <MetricCard
              title={i18n.t('status.monitor.network')}
              value={`↓${formatRate(stats.network.receiveBytesPerSec, i18n)} ↑${formatRate(stats.network.transmitBytesPerSec, i18n)}`}
              samples={history.networkBytesPerSec}
              max={networkMax}
              formatValue={(value) => formatRate(value, i18n)}
            />
          )}
        </div>

        <FilesystemsCard filesystems={stats.filesystems} />

        {stats.cpuPercent === null &&
          stats.memory === null &&
          stats.disk === null &&
          stats.filesystems.length === 0 &&
          stats.network === null &&
          stats.uptimeSeconds === null &&
          stats.loadAverage === null && (
            <p className="text-ink-faint text-[12px]">{i18n.t('monitor.unavailable')}</p>
          )}
      </div>
    </div>
  );
}

/**
 * One connected host's own detail: CPU, memory and disk as meters (the
 * `htop` shape this kind of reading calls for), CPU and memory also as a
 * short trend beneath their own meter, and a read-only systemd tab beside
 * it. The picking-a-host and connecting-if-needed parts live in `App.tsx`,
 * the same place `SftpPane` leaves them to whichever caller owns the
 * connection; this component only ever sees a host that is already open.
 */
export function MonitorWorkspace({ identity, handle, stats }: MonitorWorkspaceProps): JSX.Element {
  const i18n = useTranslator();
  const [tab, setTab] = useState<DetailTab>('home');

  return (
    <div className="flex h-full flex-col">
      <div className="border-line-subtle flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-ink max-w-full truncate text-[13px] font-semibold">{identity.name}</span>
          <span className="text-ink-faint max-w-full truncate font-mono text-[11px]">{identity.where}</span>
        </div>
      </div>

      <div className="border-line-subtle flex items-center gap-1 border-b px-3">
        {(['home', 'processes', 'systemd'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setTab(candidate)}
            className={`border-b-2 px-3 py-2 text-[12.5px] font-medium ${
              tab === candidate
                ? 'border-accent text-ink'
                : 'text-ink-faint hover:text-ink-secondary border-transparent'
            }`}
          >
            {i18n.t(TAB_LABEL[candidate])}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'home' ? (
          <HomeTab handle={handle} stats={stats} />
        ) : tab === 'processes' ? (
          <ProcessesTab handle={handle} active={tab === 'processes'} />
        ) : (
          <SystemdTab handle={handle} active={tab === 'systemd'} />
        )}
      </div>
    </div>
  );
}
