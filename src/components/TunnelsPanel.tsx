import { useState } from 'react';
import type { JSX } from 'react';

import { EMPTY_FORWARD, FORWARD_KIND_LABEL, invalidForward, parsePort, toForwards } from '../features/sessions';
import type { ForwardDraft } from '../features/sessions';
import { useTranslator } from '../features/settings';
import { FORWARD_STATE_LABEL } from '../features/status';
import type { ForwardRuntime, ForwardStatus } from '../features/status';
import type { Forward, ForwardKind } from '../ipc';

import { CheckIcon, PlusIcon, XIcon } from './ui/icons';

interface TunnelsPanelProps {
  /** This host's own forwards (ADR-0054): started the moment the session
      connected, and changed only through the host's own editor. */
  readonly forwards: readonly ForwardStatus[];
  /** Opened from this panel, on this connection alone: never written to the
      saved host, and gone at disconnect. */
  readonly adHocForwards: readonly ForwardStatus[];
  readonly onAddForward: (forward: Forward) => void;
  readonly onRemoveForward: (index: number) => void;
  readonly onEditHost: () => void;
}

const KINDS: readonly ForwardKind[] = ['local', 'remote', 'dynamic'];

const INPUT = 'bg-surface-input text-ink rounded border px-2 py-1 outline-none placeholder:text-ink-faint';

const RUNTIME_TONE: Readonly<Record<ForwardRuntime['kind'], string>> = {
  starting: 'text-accent',
  running: 'text-ok',
  failed: 'text-warn',
};

function targetOf(forward: Forward): string {
  return `${forward.targetHost ?? ''}:${String(forward.targetPort ?? '')}`;
}

/** One saved or ad-hoc row: kind, bind port, live state and, below, the
    target or (`dynamic`) a hint, and a name if it has one. `onRemove` is
    `null` for a saved row, which is closed by editing the host instead. */
function ForwardRow({
  status,
  dashed,
  onRemove,
}: {
  readonly status: ForwardStatus;
  readonly dashed: boolean;
  readonly onRemove: (() => void) | null;
}): JSX.Element {
  const i18n = useTranslator();
  const { forward, runtime } = status;

  return (
    <div
      className={`bg-surface-raised flex flex-col gap-1 rounded-md p-2.5 ${
        dashed ? 'border-line-subtle border border-dashed' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="border-line-subtle bg-surface-input text-ink-secondary rounded border px-2 py-0.5 text-[11px]">
          {i18n.t(FORWARD_KIND_LABEL[forward.kind])}
        </span>
        <span className="font-mono text-[12px]">{forward.bindPort}</span>
        <span
          className={`ml-auto flex flex-none items-center gap-1.5 text-[10.5px] ${RUNTIME_TONE[runtime.kind]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {i18n.t(FORWARD_STATE_LABEL[runtime.kind])}
        </span>
        {onRemove !== null && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={i18n.t('forward.remove')}
            title={i18n.t('forward.remove')}
            className="text-ink-faint hover:text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded"
          >
            <XIcon className="h-2 w-2" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-0.5 text-[11px]">
        {forward.kind === 'dynamic' ? (
          <span className="text-ink-faint">{i18n.t('forward.dynamic.hint')}</span>
        ) : (
          <span className="text-ink-secondary font-mono">{`→ ${targetOf(forward)}`}</span>
        )}
        {forward.name !== null && <span className="text-ink-faint ml-auto">{forward.name}</span>}
      </div>
    </div>
  );
}

/** The mini form behind "+ Add forward": one row, the same fields and kind
    picker `ForwardsFields` uses for a saved host, but firing immediately
    through `onSubmit` rather than accumulating into a draft array. There
    is no list here for it to join, only a single forward asked for now. */
function AddForwardForm({
  onSubmit,
  onCancel,
}: {
  readonly onSubmit: (forward: Forward) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const i18n = useTranslator();
  const [draft, setDraft] = useState<ForwardDraft>(EMPTY_FORWARD);
  const [checking, setChecking] = useState(false);

  const update = (patch: Partial<ForwardDraft>): void => setDraft((current) => ({ ...current, ...patch }));

  const submit = (): void => {
    if (invalidForward(draft)) {
      setChecking(true);
      return;
    }
    const [forward] = toForwards([draft]);
    if (forward !== undefined) onSubmit(forward);
  };

  const needsTarget = draft.kind !== 'dynamic';
  const bindPortInvalid = checking && parsePort(draft.bindPort) === null;
  const targetHostInvalid = checking && needsTarget && draft.targetHost.trim() === '';
  const targetPortInvalid = checking && needsTarget && parsePort(draft.targetPort) === null;

  return (
    <div className="bg-surface-raised border-line-subtle flex flex-col gap-1.5 rounded-md border border-dashed p-2.5">
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label={i18n.t('forward.kind.label')} className="flex flex-none gap-1">
          {KINDS.map((kind) => {
            const checked = kind === draft.kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => update({ kind })}
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
          value={draft.bindPort}
          onChange={(event) => update({ bindPort: event.target.value })}
          aria-label={i18n.t('forward.bindPort')}
          aria-invalid={bindPortInvalid}
          placeholder={i18n.t('forward.bindPort.placeholder')}
          autoComplete="off"
          spellCheck={false}
          className={`${INPUT} w-16 font-mono text-[12px] ${bindPortInvalid ? 'border-danger' : 'border-line-subtle'}`}
        />

        <button
          type="button"
          onClick={submit}
          aria-label={i18n.t('forward.add')}
          title={i18n.t('forward.add')}
          className="text-ok hover:text-ink ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded"
        >
          <CheckIcon className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label={i18n.t('forward.remove')}
          title={i18n.t('forward.remove')}
          className="text-ink-faint hover:text-ink flex h-5 w-5 shrink-0 items-center justify-center rounded"
        >
          <XIcon className="h-2.5 w-2.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        {needsTarget ? (
          <>
            <input
              value={draft.targetHost}
              onChange={(event) => update({ targetHost: event.target.value })}
              aria-label={i18n.t('forward.target.host')}
              aria-invalid={targetHostInvalid}
              placeholder={i18n.t('forward.target.host.placeholder')}
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT} min-w-0 flex-1 font-mono text-[11px] ${
                targetHostInvalid ? 'border-danger' : 'border-line-subtle'
              }`}
            />
            <input
              value={draft.targetPort}
              onChange={(event) => update({ targetPort: event.target.value })}
              aria-label={i18n.t('forward.target.port')}
              aria-invalid={targetPortInvalid}
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
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          aria-label={i18n.t('forward.name')}
          placeholder={i18n.t('forward.name')}
          autoComplete="off"
          spellCheck={false}
          className={`${INPUT} border-line-subtle w-24 flex-none`}
        />
      </div>
    </div>
  );
}

/**
 * The Tunnels facet: this host's saved forwards (ADR-0054), read-only here
 * and edited through `onEditHost`, and below them the forwards opened from
 * this panel for the current connection alone.
 */
export function TunnelsPanel({
  forwards,
  adHocForwards,
  onAddForward,
  onRemoveForward,
  onEditHost,
}: TunnelsPanelProps): JSX.Element {
  const i18n = useTranslator();
  const [adding, setAdding] = useState(false);

  return (
    <div className="bg-surface-terminal absolute inset-0 overflow-y-auto p-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-ink-secondary text-[11px] font-semibold tracking-wide uppercase">
            {i18n.t('tunnels.saved')}
          </h3>
          <button type="button" onClick={onEditHost} className="text-accent text-[11.5px] hover:underline">
            {i18n.t('tunnels.editHost')}
          </button>
        </div>
        {forwards.length === 0 ? (
          <p className="text-ink-faint text-[11.5px]">{i18n.t('tunnels.empty.saved')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {forwards.map((status, index) => (
              <ForwardRow key={index} status={status} dashed={false} onRemove={null} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 flex flex-col gap-2">
        <h3 className="text-ink-secondary text-[11px] font-semibold tracking-wide uppercase">
          {i18n.t('tunnels.adHoc')}
        </h3>
        {adHocForwards.length === 0 && !adding && (
          <p className="text-ink-faint text-[11.5px]">{i18n.t('tunnels.empty.adHoc')}</p>
        )}
        {adHocForwards.length > 0 && (
          <div className="flex flex-col gap-2">
            {adHocForwards.map((status, index) => (
              <ForwardRow key={index} status={status} dashed onRemove={() => onRemoveForward(index)} />
            ))}
          </div>
        )}
        {adding ? (
          <AddForwardForm
            onSubmit={(forward) => {
              onAddForward(forward);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-accent flex items-center gap-1 self-start text-[12px] hover:underline"
          >
            <PlusIcon className="h-3 w-3" />
            {i18n.t('forward.add')}
          </button>
        )}
      </section>
    </div>
  );
}
