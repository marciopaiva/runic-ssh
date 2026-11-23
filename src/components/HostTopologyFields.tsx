import type { JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';

import { HostKindPicker } from './HostKindPicker';

interface HostTopologyFieldsProps {
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  /**
   * The saved hosts that may be chosen as a jump host.
   *
   * Already filtered by `jumpHostChoice`, so what is offered is what the core
   * will accept. A select that can only produce valid answers is a whole class
   * of refusal the user never meets.
   */
  readonly jumpHosts: readonly Session[];
  /**
   * The saved hosts reached through this one.
   *
   * Non-empty means no jump host may be chosen here, because that would make
   * their chains two hops long. They are named on screen rather than counted:
   * the reason this host is treated differently is which of the user's own
   * hosts depend on it.
   */
  readonly carried: readonly Session[];
}

/**
 * Where a host sits in a chain: its kind (ADR-0031) and, unless something
 * else already rides it, which saved host it is reached through.
 *
 * ADR-0056: split out of `HostFields`, which drew this alongside the
 * host/user/port/name/group fields as one flat column. Topology and General
 * are two bordered sections now, not two halves of one block.
 */
export function HostTopologyFields({
  values,
  wrong,
  onChange,
  jumpHosts,
  carried,
}: HostTopologyFieldsProps): JSX.Element {
  const i18n = useTranslator();

  /* Drawn rather than left to the platform, for the reason in #163: the closed
     select is painted in the platform's own colours, and on dark that was a
     white box with a white label. */
  const jumpSelect = (invalid: boolean): JSX.Element => (
    <span className="relative block">
      <select
        value={values.proxyJump}
        onChange={(event) => onChange('proxyJump', event.target.value)}
        aria-invalid={invalid}
        className={`bg-surface-input text-ink w-full appearance-none rounded border py-1.5 pr-8 pl-2.5 text-[12.5px] outline-none ${
          invalid ? 'border-danger' : 'border-line-subtle'
        }`}
      >
        <option value="">{i18n.t('session.editor.jumpHost.none')}</option>
        {jumpHosts.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="text-ink-faint pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-[11px]">{i18n.t('hostKind.label')}</span>
        <HostKindPicker value={values.kind} onChange={(kind) => onChange('kind', kind)} />
      </div>

      {/* Absent rather than disabled when there is nothing to pick. A control
          that can never be used is a feature the user is told about and then
          denied; the first saved host makes it appear.

          A host other sessions are reached through is the one case where the
          absence is explained instead: there the field is missing because of
          something the user did elsewhere, to hosts that are not on this form,
          and an unexplained gap would read as the feature not existing. */}
      {carried.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.jumpHost')}</span>
          <span className="text-ink-faint text-[11px] leading-snug">
            {/* One key per number rather than a phrase that reads as though it
                were written for the other one. The catalogue cannot choose
                between them on its own: both take a hole, so the key has to be
                picked here where the count is. */}
            {carried.length === 1
              ? i18n.t('session.editor.jumpHost.serving.one', {
                  host: carried[0]?.name ?? '',
                })
              : i18n.t('session.editor.jumpHost.serving.many', {
                  hosts: i18n.list(carried.map((host) => host.name)),
                })}
          </span>
          {/* Only when the file already holds the state this now refuses. The
              control is there to be emptied, so it offers nothing but the value
              it has and the way out of it. */}
          {jumpHosts.length > 0 && (
            <label className="flex flex-col gap-1">
              <span
                className={`text-[11px] leading-snug ${
                  wrong.includes('proxyJump') ? 'text-danger-text' : 'text-ink-faint'
                }`}
              >
                {i18n.t('session.editor.jumpHost.clear')}
              </span>
              {jumpSelect(wrong.includes('proxyJump'))}
            </label>
          )}
        </div>
      ) : (
        jumpHosts.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted text-[11px]">{i18n.t('session.editor.jumpHost')}</span>
            {jumpSelect(false)}
            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('session.editor.jumpHostHint')}
            </span>
          </label>
        )
      )}
    </div>
  );
}
