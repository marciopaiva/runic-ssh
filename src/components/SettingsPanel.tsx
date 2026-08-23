import type { JSX } from 'react';

import type { DraftField, DraftValues } from '../features/sessions';
import { useTranslator } from '../features/settings';
import type { Session } from '../ipc';
import { offeredLocales } from '../lib/i18n/locales';

import { SessionForm } from './SessionForm';

/** The sections down the left of the panel. */
export type SettingsSection = 'sessions' | 'appearance';

const SECTIONS: readonly SettingsSection[] = ['sessions', 'appearance'];

/** Everything the Sessions section draws, gathered so the props stay readable. */
export interface SessionsSettings {
  readonly sessions: readonly Session[];
  /** The host whose form is open: its id, `'new'`, or `null` for none. */
  readonly editingId: string | 'new' | null;
  readonly values: DraftValues;
  readonly wrong: readonly DraftField[];
  /** Whether the form holds work that has never been saved. */
  readonly dirty: boolean;
  /** Set when something asked to throw the form away and is waiting on an answer. */
  readonly discarding: boolean;
  readonly onEdit: (sessionId: string) => void;
  readonly onNew: () => void;
  readonly onChange: (field: keyof DraftValues, value: string) => void;
  readonly onSubmit: () => void;
  readonly onDelete: () => void;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
}

interface SettingsPanelProps {
  readonly section: SettingsSection;
  readonly onSection: (section: SettingsSection) => void;
  readonly sessionsSettings: SessionsSettings;
  /** The chosen locale tag, or `null` while following the system. */
  readonly chosenLocale: string | null;
  readonly onChooseLocale: (locale: string | null) => void;
  /** Whether the window manager is drawing the title bar (ADR-0005). */
  readonly nativeDecorations: boolean;
  readonly onUseNativeDecorations: (native: boolean) => void;
}

/**
 * The settings tab's contents.
 *
 * Its own navigation down the side, the way the Windows Terminal settings tab
 * is arranged — one of the two vocabularies the visual direction adopted. The
 * panel is a tab rather than a modal so that a terminal stays open beside it,
 * which a dialog drawn over the window cannot do.
 *
 * Nothing secret reaches this component. A password is collected in a separate
 * OS window at the moment of connecting (ADR-0008), and putting a field for one
 * here would place it in the same document that renders terminal output.
 */
export function SettingsPanel({
  section,
  onSection,
  sessionsSettings,
  chosenLocale,
  onChooseLocale,
  nativeDecorations,
  onUseNativeDecorations,
}: SettingsPanelProps): JSX.Element {
  const i18n = useTranslator();

  return (
    <div className="bg-surface-base flex h-full min-h-0">
      <nav
        aria-label={i18n.t('settings.nav')}
        className="border-line-subtle flex w-[180px] shrink-0 flex-col gap-0.5 border-r p-3"
      >
        <h1 className="text-ink-muted mb-2 px-2 text-[11px] font-semibold tracking-wide uppercase">
          {i18n.t('settings.title')}
        </h1>

        {SECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            aria-current={section === name ? 'page' : undefined}
            onClick={() => onSection(name)}
            className={`rounded px-2 py-1.5 text-left text-[12.5px] ${
              section === name
                ? 'bg-surface-raised text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {i18n.t(`settings.${name}`)}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {section === 'sessions' && <SessionsSection settings={sessionsSettings} />}

        <div className={`flex max-w-[560px] flex-col gap-6 ${section === 'appearance' ? '' : 'hidden'}`}>
          <div className="flex flex-col gap-1">
            <h2 className="text-ink text-[14px] font-semibold">
              {i18n.t('settings.appearance')}
            </h2>
            <p className="text-ink-secondary text-[12.5px] leading-relaxed">
              {i18n.t('settings.appearance.lead')}
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-ink text-[12.5px] font-medium">
              {i18n.t('settings.language')}
            </span>
            <select
              value={chosenLocale ?? ''}
              onChange={(event) =>
                onChooseLocale(event.target.value === '' ? null : event.target.value)
              }
              className="bg-surface-input text-ink border-line-subtle w-[260px] rounded border px-2.5 py-1.5 text-[12.5px] outline-none"
            >
              <option value="">{i18n.t('settings.language.system')}</option>
              {offeredLocales().map((locale) => (
                /* The language's own name for itself, never translated: a
                   reader looking for their language cannot find it under a
                   name written in one they do not read. */
                <option key={locale.tag} value={locale.tag}>
                  {locale.name}
                </option>
              ))}
            </select>
            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.language.hint')}
            </span>
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-ink pb-1.5 text-[12.5px] font-medium">
              {i18n.t('settings.decorations')}
            </legend>

            {/* Two radios rather than a checkbox: the choice is between two
                things that are both drawn, and a checkbox labelled "native
                decorations" leaves the off state unnamed. */}
            {[false, true].map((native) => (
              <label key={String(native)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decorations"
                  checked={nativeDecorations === native}
                  onChange={() => onUseNativeDecorations(native)}
                  className="accent-accent"
                />
                <span className="text-ink-secondary text-[12.5px]">
                  {i18n.t(native ? 'settings.decorations.native' : 'settings.decorations.drawn')}
                </span>
              </label>
            ))}

            <span className="text-ink-faint text-[11px] leading-snug">
              {i18n.t('settings.decorations.hint')}
            </span>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

/**
 * Saved hosts, and the form for whichever one is open.
 *
 * The list and the form share one slot: opening another host replaces what is
 * on screen. That is why the discard bar exists rather than being a nicety —
 * as a modal this form was answered and dismissed in one go, and there was
 * never a second host to move to.
 */
function SessionsSection({ settings }: { readonly settings: SessionsSettings }): JSX.Element {
  const i18n = useTranslator();
  const {
    sessions,
    editingId,
    values,
    wrong,
    dirty,
    discarding,
    onEdit,
    onNew,
    onChange,
    onSubmit,
    onDelete,
    onConfirmDiscard,
    onCancelDiscard,
  } = settings;

  const editingName =
    editingId === null || editingId === 'new'
      ? null
      : (sessions.find((session) => session.id === editingId)?.name ?? null);

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-ink text-[14px] font-semibold">{i18n.t('settings.sessions')}</h2>
        <p className="text-ink-secondary text-[12.5px] leading-relaxed">
          {i18n.t('settings.sessions.lead')}
        </p>
      </div>

      {discarding && (
        /* Drawn above the list rather than as a dialog: the thing at risk is
           right below it, and a dialog would cover the form somebody is being
           asked to decide about. */
        <div
          role="alertdialog"
          aria-label={i18n.t('settings.discard.title')}
          className="border-danger bg-danger-soft flex flex-wrap items-center gap-3 rounded border px-3 py-2"
        >
          <p className="text-danger-text mr-auto text-[12px]">{i18n.t('settings.discard.title')}</p>
          <button
            type="button"
            onClick={onCancelDiscard}
            className="border-line-strong text-ink-secondary hover:text-ink rounded border bg-transparent px-2.5 py-1 text-[12px]"
          >
            {i18n.t('settings.discard.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirmDiscard}
            className="text-danger-text border-danger rounded border px-2.5 py-1 text-[12px] font-semibold"
          >
            {i18n.t('settings.discard.confirm')}
          </button>
        </div>
      )}

      <div className="flex min-h-0 gap-6">
        <div className="flex w-[220px] shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onNew}
            className="border-line-subtle text-ink-secondary hover:text-ink mb-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-[12px] font-semibold"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {i18n.t('settings.sessions.new')}
          </button>

          {sessions.length === 0 ? (
            <p className="text-ink-faint px-2 py-1 text-[11.5px]">
              {i18n.t('settings.sessions.none')}
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                aria-current={session.id === editingId ? 'true' : undefined}
                onClick={() => onEdit(session.id)}
                /* The same inset accent bar the sidebar uses for the row it is
                   on. A background tint alone reads as hover on a list this
                   dense, and the form beside it belongs to exactly one row. */
                className={`flex flex-col rounded-md px-2.5 py-2 text-left ${
                  session.id === editingId
                    ? 'bg-surface-raised text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <span className="truncate text-[12.5px]">{session.name}</span>
                <span className="text-ink-faint truncate font-mono text-[11px]">
                  {session.user}@{session.host}:{session.port}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editingId === null ? (
            <p className="text-ink-faint text-[12px]">{i18n.t('settings.sessions.pick')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 className="text-ink-muted flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
                {editingId === 'new' || editingName === null
                  ? i18n.t('settings.sessions.adding')
                  : i18n.t('settings.sessions.editing', { name: editingName })}
                {dirty && (
                  <span
                    aria-hidden="true"
                    className="bg-accent inline-block h-1.5 w-1.5 rounded-full"
                  />
                )}
              </h3>

              <SessionForm
                values={values}
                wrong={wrong}
                onChange={onChange}
                onSubmit={onSubmit}
                onDelete={editingId === 'new' ? null : onDelete}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
