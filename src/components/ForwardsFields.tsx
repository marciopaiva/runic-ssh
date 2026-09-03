import type { JSX } from 'react';

import { EMPTY_FORWARD, FORWARD_KIND_LABEL, parsePort } from '../features/sessions';
import type { DraftField, ForwardDraft } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { ForwardKind } from '../ipc';

interface ForwardsFieldsProps {
  readonly value: readonly ForwardDraft[];
  /** The fields a submit found wrong; empty until one has been attempted.
   * `'forwards'` present means at least one row below is incomplete. */
  readonly wrong: readonly DraftField[];
  readonly onChange: (forwards: readonly ForwardDraft[]) => void;
}

const KINDS: readonly ForwardKind[] = ['local', 'remote', 'dynamic'];

const INPUT =
  'bg-surface-input text-ink rounded border px-2 py-1 outline-none placeholder:text-ink-faint';

/**
 * A saved host's own forwards (ADR-0054): a list of rows, each picking a
 * kind with the same three-pill control `HostKindPicker` already uses for
 * Topology, relabelled, plus a bind port, a target (hidden for `dynamic`,
 * whose destination is read from the SOCKS handshake rather than stored),
 * and an optional name.
 *
 * No row has a stable id of its own the way a saved `Session` does, so
 * `onChange` always replaces the whole list: adding, removing or editing one
 * row is a new array, never a patch to an existing one.
 */
export function ForwardsFields({ value, wrong, onChange }: ForwardsFieldsProps): JSX.Element {
  const i18n = useTranslator();
  const checking = wrong.includes('forwards');

  const update = (index: number, patch: Partial<ForwardDraft>): void => {
    onChange(value.map((forward, at) => (at === index ? { ...forward, ...patch } : forward)));
  };

  const remove = (index: number): void => {
    onChange(value.filter((_, at) => at !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      {value.map((forward, index) => {
        const bindPortInvalid = checking && parsePort(forward.bindPort) === null;
        const needsTarget = forward.kind !== 'dynamic';
        const targetHostInvalid = checking && needsTarget && forward.targetHost.trim() === '';
        const targetPortInvalid = checking && needsTarget && parsePort(forward.targetPort) === null;

        return (
          <div key={index} className="bg-surface-raised flex flex-col gap-1.5 rounded-md p-2.5">
            <div className="flex items-center gap-2">
              <div
                role="radiogroup"
                aria-label={i18n.t('forward.kind.label')}
                className="flex flex-none gap-1"
              >
                {KINDS.map((kind) => {
                  const checked = kind === forward.kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => update(index, { kind })}
                      className={`rounded border px-2 py-1 text-[11px] ${
                        checked
                          ? 'border-accent bg-accent-soft text-ink'
                          : 'border-line-subtle text-ink-secondary hover:bg-surface-raised/60'
                      }`}
                    >
                      {i18n.t(FORWARD_KIND_LABEL[kind])}
                    </button>
                  );
                })}
              </div>

              <input
                value={forward.bindPort}
                onChange={(event) => update(index, { bindPort: event.target.value })}
                aria-label={i18n.t('forward.bindPort')}
                aria-invalid={bindPortInvalid}
                title={i18n.t('forward.bindPort')}
                placeholder={i18n.t('forward.bindPort.placeholder')}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT} w-16 font-mono text-[12px] ${
                  bindPortInvalid ? 'border-danger' : 'border-line-subtle'
                }`}
              />

              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={i18n.t('forward.remove')}
                title={i18n.t('forward.remove')}
                className="text-ink-faint hover:text-ink ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded"
              >
                <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" aria-hidden="true">
                  <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              {needsTarget ? (
                <>
                  <input
                    value={forward.targetHost}
                    onChange={(event) => update(index, { targetHost: event.target.value })}
                    aria-label={i18n.t('forward.target.host')}
                    aria-invalid={targetHostInvalid}
                    title={i18n.t('forward.target.host')}
                    placeholder={i18n.t('forward.target.host.placeholder')}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${INPUT} min-w-0 flex-1 font-mono text-[11px] ${
                      targetHostInvalid ? 'border-danger' : 'border-line-subtle'
                    }`}
                  />
                  <input
                    value={forward.targetPort}
                    onChange={(event) => update(index, { targetPort: event.target.value })}
                    aria-label={i18n.t('forward.target.port')}
                    aria-invalid={targetPortInvalid}
                    title={i18n.t('forward.target.port')}
                    placeholder={i18n.t('forward.target.port.placeholder')}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${INPUT} w-16 font-mono text-[11px] ${
                      targetPortInvalid ? 'border-danger' : 'border-line-subtle'
                    }`}
                  />
                </>
              ) : (
                <span className="text-ink-faint flex-1">{i18n.t('forward.dynamic.hint')}</span>
              )}
              <input
                value={forward.name}
                onChange={(event) => update(index, { name: event.target.value })}
                aria-label={i18n.t('forward.name')}
                placeholder={i18n.t('forward.name')}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT} border-line-subtle w-24 flex-none`}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...value, EMPTY_FORWARD])}
        className="text-accent self-start text-[12px] hover:underline"
      >
        {i18n.t('forward.add')}
      </button>
    </div>
  );
}
