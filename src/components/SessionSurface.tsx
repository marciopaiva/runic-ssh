import type { JSX, ReactNode } from 'react';

interface SessionSurfaceProps {
  /** Ties the heading to the section for assistive technology. */
  readonly titleId: string;
  readonly title: string;
  /** Raises the border and heading, for a surface that reports a refusal. */
  readonly tone?: 'neutral' | 'danger';
  /** Announced when it appears. For anything the user did not just ask for. */
  readonly alert?: boolean;
  readonly icon?: ReactNode;
  /** The sentence under the title. */
  readonly body: ReactNode;
  /** Fields, fingerprints, a confirmation — whatever this surface is about. */
  readonly children?: ReactNode;
  /** Sits at the leading edge of the action row, for a consequence to state. */
  readonly note?: ReactNode;
  readonly actions: ReactNode;
}

/**
 * The one shape a session speaks to the user in.
 *
 * ADR-0015: a surface belongs to a session or to the application, and a
 * session's surface renders flat inside that session's panel. Before it there
 * were five shapes — a card with a real backdrop, two cards with no positioning
 * at all that fell into the corner of the window, a centred block, and a tab —
 * and the user met three of them in three consecutive screens.
 *
 * Deliberately not a dialog. It carries no `aria-modal`, because the three
 * host key screens used to claim it while having no backdrop, no focus trap and
 * no centring: markup that tells a screen reader the rest of the application is
 * inert when it is not. What is left is a labelled section, with `role="alert"`
 * for the ones that appear without being asked for.
 *
 * It sizes to the panel rather than to a pixel width. The panel is one session's
 * share of the window, and a 640px card inside it was measured against the
 * window it no longer occupies.
 */
export function SessionSurface({
  titleId,
  title,
  tone = 'neutral',
  alert = false,
  icon,
  body,
  children,
  note,
  actions,
}: SessionSurfaceProps): JSX.Element {
  const danger = tone === 'danger';

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <section
        aria-labelledby={titleId}
        {...(alert ? { role: 'alert' } : {})}
        className={`bg-surface-raised flex w-full max-w-[560px] flex-col gap-4 rounded-xl border p-6 ${
          danger ? 'border-danger/50' : 'border-line-subtle'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {icon !== undefined && (
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
                danger
                  ? 'border-danger/60 bg-danger-soft text-danger'
                  : 'border-line-strong bg-surface-base text-accent-bright'
              }`}
            >
              {icon}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <h2
              id={titleId}
              className={`text-[15px] font-bold tracking-tight ${
                danger ? 'text-danger-text' : 'text-ink'
              }`}
            >
              {title}
            </h2>
            <div className="text-ink-muted text-[12.5px] leading-relaxed text-pretty">{body}</div>
          </div>
        </div>

        {children}

        <div className="border-line-subtle flex items-end gap-3 border-t pt-3.5">
          {note !== undefined && <span className="text-ink-faint text-[11.5px]">{note}</span>}
          {/* Never compressed by the note beside it. A two-line note used to
              squeeze these until the label wrapped inside the button, which is
              a broken control rather than a tight one. */}
          <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div>
        </div>
      </section>
    </div>
  );
}

interface SurfaceActionProps {
  readonly onClick: () => void;
  readonly variant: 'primary' | 'secondary';
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

/**
 * A button on a session surface.
 *
 * Here rather than in each screen because the four of them had four different
 * heights, radii and weights, which is the sort of drift nobody sees in one
 * screenshot and everybody feels across three.
 */
export function SurfaceAction({
  onClick,
  variant,
  disabled = false,
  children,
}: SurfaceActionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-[34px] rounded-md px-4 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === 'primary'
          ? 'bg-accent text-surface-base'
          : 'border-line-strong text-ink-secondary hover:text-ink border'
      }`}
    >
      {children}
    </button>
  );
}
