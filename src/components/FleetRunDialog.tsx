import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { differingLines, groupResults, hasReference, visibleText } from '../features/fleet/group';
import { useTranslator } from '../features/settings';
import { asIpcError, fleetRun } from '../ipc';
import type { FleetResult, Macro } from '../ipc';
import type { SessionHandle } from '../ipc/sessions';
import type { VisionPreset } from '../features/fleet/visions';

import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

/** A connected session a run may reach. */
export interface FleetTarget {
  readonly handle: SessionHandle;
  readonly name: string;
  readonly address: string;
}

interface FleetRunDialogProps {
  /** The script macro to run, or `null` while the dialog is closed. */
  readonly macro: Macro | null;
  readonly targets: readonly FleetTarget[];
  /** Visions that can pre-pick the hosts. Empty when there are none. */
  readonly visions?: readonly VisionPreset[];
  readonly onClose: () => void;
}

type Phase =
  | { readonly kind: 'confirm'; readonly error: string | null }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly results: readonly FleetResult[] };

/**
 * Run one saved script macro on several connected hosts (ADR-0078).
 *
 * Always asks first: the script's own text and every host it will reach are
 * on screen before anything is sent, and nothing runs until the person
 * confirms. What comes back is grouped by identical answer, the largest
 * group first, with the lines of every other group that differ marked.
 * Output is host-supplied, so it is drawn as text with control characters
 * made visible, never as markup.
 */
export function FleetRunDialog({ macro, targets, visions = [], onClose }: FleetRunDialogProps): JSX.Element {
  const i18n = useTranslator();
  return (
    <Dialog
      open={macro !== null}
      onClose={onClose}
      size="full"
      title={macro === null ? '' : `${i18n.t('fleet.title')}: ${macro.name}`}
    >
      {macro !== null && <FleetRunBody key={macro.id} macro={macro} targets={targets} visions={visions} onClose={onClose} />}
    </Dialog>
  );
}

function FleetRunBody({
  macro,
  targets,
  visions,
  onClose,
}: {
  macro: Macro;
  targets: readonly FleetTarget[];
  visions: readonly VisionPreset[];
  onClose: () => void;
}): JSX.Element {
  const i18n = useTranslator();
  const [ticked, setTicked] = useState<ReadonlySet<SessionHandle>>(() => new Set(targets.map((t) => t.handle)));
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm', error: null });
  const [picked, setPicked] = useState<VisionPreset | null>(null);
  const nameOf = useMemo(() => new Map(targets.map((t) => [t.handle, t.name])), [targets]);

  const toggle = (handle: SessionHandle): void => {
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  /* A vision pre-picks its connected members. Only hosts this dialog lists
     can be ticked, so a stale handle cannot be sent. */
  const pickVision = (vision: VisionPreset): void => {
    const reachable = new Set(targets.map((t) => t.handle));
    setTicked(new Set(vision.handles.filter((handle) => reachable.has(handle))));
    setPicked(vision);
  };

  const run = (): void => {
    const handles = targets.map((t) => t.handle).filter((handle) => ticked.has(handle));
    if (handles.length === 0) return;
    setPhase({ kind: 'running' });
    fleetRun(macro.id, handles)
      .then((results) => setPhase({ kind: 'done', results }))
      .catch((rejection: unknown) => {
        const failure = asIpcError(rejection);
        setPhase({
          kind: 'confirm',
          error: i18n.t(failure?.code === 'macroNotScript' ? 'fleet.error.notScript' : 'fleet.error.generic'),
        });
      });
  };

  return (
    <div className="flex max-h-[min(78vh,720px)] min-h-0 flex-col gap-3">
      {phase.kind !== 'done' && (
        <>
          <p className="text-ink-faint text-[11.5px]">{i18n.t('fleet.note')}</p>
          <div className="flex flex-col gap-1">
            <span className="text-ink-faint text-[11px]">{i18n.t('fleet.macro')}</span>
            <pre className="bg-surface-terminal border-line-subtle text-ink-secondary max-h-40 overflow-auto rounded border p-2 font-mono text-[12px] whitespace-pre-wrap">
              {visibleText(macro.text)}
            </pre>
          </div>
          {visions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-ink-faint text-[11px]">{i18n.t('fleet.visions')}</span>
              <div className="flex flex-wrap gap-1.5">
                {visions.map((vision) => (
                  <Button
                    key={vision.id}
                    variant={picked?.id === vision.id ? 'secondary' : 'ghost'}
                    size="sm"
                    disabled={phase.kind === 'running'}
                    onClick={() => pickVision(vision)}
                  >
                    {i18n.t('fleet.vision', {
                      name: vision.name,
                      connected: vision.handles.length,
                      total: vision.handles.length + vision.skipped.length,
                    })}
                  </Button>
                ))}
              </div>
              {picked !== null && picked.skipped.length > 0 && (
                <p className="text-ink-faint text-[11.5px]">
                  {i18n.t('fleet.skipped', { hosts: i18n.list(picked.skipped) })}
                </p>
              )}
            </div>
          )}
          <div className="flex min-h-0 flex-col gap-1">
            <span className="text-ink-faint text-[11px]">{i18n.t('fleet.hosts')}</span>
            {targets.length === 0 ? (
              <p className="text-ink-secondary text-[12.5px]">{i18n.t('fleet.none')}</p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {targets.map((target) => (
                  <li key={String(target.handle)}>
                    <label className="hover:bg-surface-raised flex items-center gap-2 rounded px-2 py-1 text-[12.5px]">
                      <input
                        type="checkbox"
                        checked={ticked.has(target.handle)}
                        onChange={() => toggle(target.handle)}
                        disabled={phase.kind === 'running'}
                      />
                      <span className="text-ink">{target.name}</span>
                      <span className="text-ink-faint font-mono text-[11px]">{target.address}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {phase.kind === 'confirm' && phase.error !== null && (
            <p role="alert" className="text-danger-text text-[12px]">
              {phase.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {i18n.t('fleet.close')}
            </Button>
            <Button
              variant="primary"
              onClick={run}
              loading={phase.kind === 'running'}
              disabled={ticked.size === 0 || phase.kind === 'running'}
            >
              {phase.kind === 'running' ? i18n.t('fleet.running') : i18n.t('fleet.run', { count: ticked.size })}
            </Button>
          </div>
        </>
      )}

      {phase.kind === 'done' && <FleetResults results={phase.results} nameOf={nameOf} onBack={() => setPhase({ kind: 'confirm', error: null })} onClose={onClose} />}
    </div>
  );
}

function FleetResults({
  results,
  nameOf,
  onBack,
  onClose,
}: {
  results: readonly FleetResult[];
  nameOf: ReadonlyMap<SessionHandle, string>;
  onBack: () => void;
  onClose: () => void;
}): JSX.Element {
  const i18n = useTranslator();
  const { groups, failed } = groupResults(results);
  const total = results.length;
  const reference = groups[0];
  /* A tie has no common answer to differ from, so nothing is titled or marked
     against one. */
  const referenced = hasReference(groups);
  const names = (handles: readonly SessionHandle[]): string => handles.map((h) => nameOf.get(h) ?? String(h)).join(', ');

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {groups.map((group, index) => {
          const differing =
            !referenced || index === 0 || reference === undefined
              ? new Set<number>()
              : differingLines(group.stdout, reference.stdout);
          const lines = visibleText(group.stdout).split('\n');
          return (
            <section
              key={`${index}-${group.handles.join(',')}`}
              className={`bg-surface-panel rounded border p-2.5 ${referenced && index === 0 ? 'border-line-subtle' : 'border-warn'}`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink text-[12.5px] font-semibold">
                  {i18n.t(!referenced ? 'fleet.group.tie' : index === 0 ? 'fleet.group.reference' : 'fleet.group.differs')}
                </span>
                <span className="text-ink-faint text-[11px]">
                  {i18n.t('fleet.group', { count: group.handles.length, total })} ·{' '}
                  {group.exitStatus === null ? i18n.t('fleet.exit.none') : i18n.t('fleet.exit', { code: group.exitStatus })}
                </span>
              </header>
              <p className="text-ink-faint mt-1 text-[11px]">{names(group.handles)}</p>
              <pre className="bg-surface-terminal text-ink-secondary mt-1.5 overflow-x-auto rounded p-2 font-mono text-[12px]">
                {group.stdout === '' ? (
                  <span className="text-ink-faint">{i18n.t('fleet.empty')}</span>
                ) : (
                  lines.map((line, i) => (
                    <span key={i} className={differing.has(i) ? 'text-ink block border-l-2 border-warn pl-1.5' : 'block'}>
                      {line === '' ? ' ' : line}
                    </span>
                  ))
                )}
              </pre>
              {group.stderr !== '' && (
                <>
                  <span className="text-ink-faint mt-1.5 block text-[11px]">{i18n.t('fleet.stderr')}</span>
                  <pre className="bg-surface-terminal text-danger-text mt-0.5 overflow-x-auto rounded p-2 font-mono text-[12px] whitespace-pre-wrap">
                    {visibleText(group.stderr)}
                  </pre>
                </>
              )}
              {group.truncated && <p className="text-warn mt-1 text-[11px]">{i18n.t('fleet.truncated')}</p>}
              {group.timedOut && <p className="text-warn mt-1 text-[11px]">{i18n.t('fleet.timedOut')}</p>}
            </section>
          );
        })}
        {failed.length > 0 && <p className="text-danger-text text-[12px]">{i18n.t('fleet.failed', { names: names(failed) })}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          {i18n.t('fleet.back')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {i18n.t('fleet.close')}
        </Button>
      </div>
    </>
  );
}
