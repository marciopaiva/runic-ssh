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
  /**
   * Whether this surface is a card inside a panel or the whole of a window.
   *
   * `panel` is the original and the common case: a session's share of the main
   * window, where the surface floats as a card with room around it.
   *
   * `window` is for the credential prompt, which ADR-0008 puts in a window of
   * its own. There is nothing to float inside, so it fills the surface it has
   * and the action row stays put while the rest scrolls. It carries a border
   * for the same reason: ADR-0028 took the desktop's title bar off that window,
   * and without an edge of some kind it is a rectangle of our own colours
   * floating on more of our own colours. That is not a
   * refinement: the prompt is the one surface whose window size is decided in
   * Rust, and a compositor that draws its title bar inside the size it was
   * given leaves less room than was asked for. The buttons have to survive
   * that, because a prompt that cannot be answered is a connection that hangs.
   */
  readonly variant?: 'panel' | 'window';
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
  variant = 'panel',
}: SessionSurfaceProps): JSX.Element {
  const danger = tone === 'danger';
  const windowed = variant === 'window';

  const heading = (
    <>
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
    </>
  );

  return (
    <div className={windowed ? 'h-full' : 'flex h-full items-center justify-center overflow-y-auto p-8'}>
      <section
        aria-labelledby={titleId}
        {...(alert ? { role: 'alert' } : {})}
        className={`bg-surface-raised flex flex-col gap-4 ${
          windowed
            ? 'border-line-strong h-full w-full border p-5'
            : `w-full max-w-[560px] rounded-xl border p-6 ${
                danger ? 'border-danger/50' : 'border-line-subtle'
              }`
        }`}
      >
        {/* Filling a window, the heading and the content scroll and the action
            row does not. Floating in a panel, the panel scrolls and nothing
            here needs to.

            The negative margin puts the scrollbar where a scrollbar belongs,
            against the edge of the window, and the padding it cancels is then
            the gap between the content and it. Without the pair the region
            stopped at the section's padding and the scrollbar was drawn on top
            of where the fields end: a private key field with its right border
            under the thumb, and no gap anywhere. */}
        {windowed ? (
          <div className="-mr-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-5">
            {heading}
          </div>
        ) : (
          heading
        )}

        <div className="border-line-subtle flex shrink-0 items-end gap-3 border-t pt-3.5">
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
  /** Absent for a submit, where the form the button sits in is what runs. */
  readonly onClick?: () => void;
  readonly variant: 'primary' | 'secondary';
  readonly disabled?: boolean;
  /** `submit` only for a surface wrapped in a form, which is the prompt. */
  readonly type?: 'button' | 'submit';
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
  type = 'button',
  children,
}: SurfaceActionProps): JSX.Element {
  return (
    <button
      type={type}
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
