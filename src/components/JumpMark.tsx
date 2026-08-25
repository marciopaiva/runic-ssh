import type { JSX } from 'react';

import type { JumpRole } from '../features/sessions';
import { useTranslator } from '../features/settings';

interface JumpMarkProps {
  readonly role: JumpRole;
}

/**
 * Says whether a host carries other hosts, or is carried by one.
 *
 * Two glyphs rather than one mark in two colours. The palette rule this
 * application follows is that a state is never carried by colour alone, and a
 * chain has two ends that mean opposite things: one is a machine other people's
 * traffic passes through, the other is a machine that cannot be reached without
 * it. Reading the wrong one for the other is worse than reading neither.
 *
 * Beside the name rather than at the end of the row. The right-hand slot is
 * already spoken for three times over, by the sync tick, by `SPARED`, and by
 * the address, and a fourth tenant there would be the one that loses.
 *
 * Static, and deliberately so. Both facts come from the saved list, so a host
 * says what it is before anything is connected. What is open is a different
 * question and is #168.
 */
export function JumpMark({ role }: JumpMarkProps): JSX.Element | null {
  const i18n = useTranslator();

  /* Three shapes of one family, all about the path a connection takes: a
     straight line goes there, a fork sends others on, a turn arrives from
     somewhere else. The straight one is drawn at the quietest weight the
     palette has, because most hosts connect directly and a mark on almost
     every row stops being a mark. The fork is the only coloured thing in the
     column, so it still finds the eye first. */
  if (!role.carries && !role.rides) {
    return (
      <svg
        viewBox="0 0 16 16"
        className="text-ink-disabled w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={i18n.t('sessions.jump.direct')}
      >
        <path d="M2 8h9M10 5.5 12.5 8 10 10.5" />
      </svg>
    );
  }

  return (
    <span className="flex w-3 shrink-0 items-center justify-center gap-0.5">
      {role.carries && (
        <svg
          viewBox="0 0 16 16"
          className="text-accent h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={i18n.t('sessions.jump.carries')}
        >
          {/* One way in, two ways on: what a bastion does. */}
          <path d="M1.5 8h5M6.5 8l5-4.5M6.5 8l5 4.5" />
          <circle cx="13" cy="3.5" r="1.4" />
          <circle cx="13" cy="12.5" r="1.4" />
        </svg>
      )}

      {role.rides && (
        <svg
          viewBox="0 0 16 16"
          className="text-ink-faint h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={i18n.t('sessions.jump.rides')}
        >
          {/* A turn: this host is arrived at from somewhere else. */}
          <path d="M3.5 2.5v7a2.5 2.5 0 0 0 2.5 2.5h6.5M10 9l3 3-3 3" />
        </svg>
      )}
    </span>
  );
}
