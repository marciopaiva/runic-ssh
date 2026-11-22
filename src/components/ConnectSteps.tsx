import type { JSX } from 'react';

import type { ConnectStep } from '../features/sessions/connect';
import { useTranslator } from '../features/settings';

import { SigilMark } from './SigilMark';

const STEPS: readonly ConnectStep[] = ['reaching', 'authenticating'];

type Mark = 'done' | 'running' | 'failed' | 'waiting';

interface ConnectStepsProps {
  /** The step under way, or the one that failed. */
  readonly step: ConnectStep;
  /** Whether `step` is where it stopped rather than where it is. */
  readonly failed?: boolean;
  /** The host's saved id, for its sigil. Absent draws the steps alone. */
  readonly sigilId?: string | undefined;
}

/**
 * The steps of connecting and where this attempt is in them.
 *
 * Only steps the interface can tell apart for certain (see `ConnectStep`), so
 * what is ticked off has happened and what failed is where it failed.
 */
export function ConnectSteps({ step, failed = false, sigilId }: ConnectStepsProps): JSX.Element {
  const i18n = useTranslator();
  const at = STEPS.indexOf(step);

  const markOf = (index: number): Mark => {
    if (index < at) return 'done';
    if (index === at) return failed ? 'failed' : 'running';
    return 'waiting';
  };

  const steps = (
    <ol className="flex flex-col gap-1.5" aria-label={i18n.t('connecting.steps')}>
      {STEPS.map((name, index) => {
        const mark = markOf(index);
        return (
          <li
            key={name}
            aria-current={mark === 'running' ? 'step' : undefined}
            className={`flex items-baseline gap-2 text-[12px] ${
              mark === 'failed'
                ? 'text-danger-text'
                : mark === 'waiting'
                  ? 'text-ink-disabled'
                  : mark === 'running'
                    ? 'text-ink'
                    : 'text-ink-muted'
            }`}
          >
            <span className="w-3 shrink-0 text-center font-mono" aria-hidden="true">
              {mark === 'done' ? '✓' : mark === 'failed' ? '✕' : mark === 'running' ? '›' : '·'}
            </span>
            <span>{i18n.t(`connecting.step.${name}`)}</span>
          </li>
        );
      })}
    </ol>
  );

  if (sigilId === undefined) return steps;

  /* Cut as far as the steps have really got: the first step done is the lower
     half, and the whole of it is only ever reached by connecting. */
  const lit = at === 0 ? 0 : 1;
  return (
    <div className="flex items-center gap-4">
      <SigilMark id={sigilId} lit={lit} failed={failed} />
      {steps}
    </div>
  );
}
