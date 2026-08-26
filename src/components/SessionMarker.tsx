import type { JSX } from 'react';

import { describeState } from '../features/sessions/state';
import type { ConnectionKind } from '../features/sessions/state';
import { useTranslator } from '../features/settings';

/**
 * The dot that says what a session is doing.
 *
 * Every state is a different *shape*, drawn before any colour is applied, so
 * the sidebar reads in greyscale and to someone who cannot separate red from
 * green. The colour is the second signal, not the only one — see
 * `features/sessions/state.ts`, and the test that fails if two states ever
 * share a shape.
 */
export function SessionMarker({ kind }: { readonly kind: ConnectionKind }): JSX.Element {
  const i18n = useTranslator();
  const state = describeState(kind);
  const label = i18n.t(state.label);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${state.tone}`}
    >
      {state.shape === 'filled' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}

      {state.shape === 'outlined' && (
        <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-current" />
      )}

      {state.shape === 'halo' && (
        <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-current ring-[3px] ring-current/25" />
      )}

      {/* A dot with the line it sits on continuing past it on both sides:
          something is passing through this host. The three plain dots are the
          states of its own session, and a fourth dot would read as one of
          them.

          Not an arrow, though an arrow was the obvious drawing and was tried.
          The column immediately to the right of this one is already three
          arrows saying which way a chain runs, and a fourth in the state
          column read as a fifth member of that family from across the
          sidebar. This one has no direction on purpose: what it says is that
          the host is in the middle of something, not which way. */}
      {state.shape === 'passing' && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path
            d="M1.5 8h3M11.5 8h3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        </svg>
      )}

      {state.shape === 'warning' && (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
          <path
            d="M8 2.8L14.2 13.2H1.8z M8 6.6v3M8 11.3v.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* A slashed circle, not a bare cross. Every tab and every row already
          carries a close X, and a state marker shaped like the button beside
          it is a state marker nobody reads. */}
      {state.shape === 'crossed' && (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.6 5.6l4.8 4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
