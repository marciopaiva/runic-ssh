import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useTranslator } from '../features/settings';
/* From the modules themselves, never from `src/ipc/index.ts`. The barrel
   re-exports the terminal wrappers, which subscribe to output a host sent —
   importing it here would pull that code into this document and undo the one
   property ADR-0008 rests on. tests/credential-window.test.ts caught exactly
   that on its first run. */
import { credentialPrompt, dismissCredential, submitCredential } from '../ipc/credential';
import type { CredentialPrompt, Keep } from '../ipc/credential';
import { asIpcError } from '../ipc/errors';
import { internalVaultStatus } from '../ipc/vault';

/* Presentational only, and checked as such: `tests/credential-window.test.ts`
   walks this file's imports and fails on anything that reaches a session or a
   byte a host sent. `JumpHostNotice` beside it does not qualify, because it
   takes its type from the `ipc` barrel. */
import { SessionSurface, SurfaceAction } from '../components/SessionSurface';

type Method = 'password' | 'key';

/**
 * The credential prompt.
 *
 * ADR-0008 in one component. Three things about it are load-bearing rather
 * than stylistic:
 *
 * **Nothing typed here is ever held in React state.** The inputs are
 * uncontrolled and read from the DOM at the moment of submitting. State would
 * put the secret in a React fibre, which outlives the field and is reachable
 * from anything running in this document.
 *
 * **The window is destroyed by the core after answering**, which discards this
 * document, its DOM and its heap. That is the closest thing JavaScript has to
 * zeroizing, and the reason the prompt is a window rather than a modal.
 *
 * **Every path answers.** Submitting answers, cancelling answers, and closing
 * the window answers through the core's own window event. A request that could
 * be left open would leave a connection waiting on a reply that never comes,
 * which reads as the application having hung.
 */
export function CredentialWindow({ request }: { readonly request: number | null }): JSX.Element {
  const i18n = useTranslator();
  const [prompt, setPrompt] = useState<CredentialPrompt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('password');
  const [busy, setBusy] = useState(false);
  /* ADR-0035: which store `prompt.canRemember` actually means, so `'stored'`
   * below can say which. A vault probe that fails leaves this `false`, the
   * same keychain fallback `can_remember` itself takes on the Rust side. */
  const [usesVault, setUsesVault] = useState(false);

  const form = useRef<HTMLFormElement>(null);
  /* Whichever field the answer starts in, which is not always an input: with a
     private key asked for it is the key itself, not the passphrase under it.
     Focusing the second field scrolled the heading out of the window, so the
     prompt opened already looking as though something had gone wrong.

     A callback rather than the object form, because the same ref lands on an
     input in one branch and a textarea in the other and React's ref objects
     are invariant: no single element type accepts both. */
  const first = useRef<HTMLElement | null>(null);
  const takeFirst = (node: HTMLElement | null): void => {
    first.current = node;
  };

  useEffect(() => {
    if (request === null) {
      setFailure('unknownRequest');
      return;
    }

    void credentialPrompt(request)
      .then((fetched) => {
        setPrompt(fetched);
        /* ADR-0030. Seeded once, from the answer this fetch itself carries,
           never re-applied on a later render: the user's own tab switch must
           win once they have made one, and nothing after this ever changes
           `fetched.suggestedMethod` to disagree with a choice already made. */
        if (fetched.suggestedMethod === 'privateKey') setMethod('key');
      })
      .catch((rejection: unknown) => {
        /* The real rejection, not a guess at it. An earlier version fell back
           to 'unknownRequest' for anything it could not parse, which meant
           every failure in here read as the same one and hid what was
           actually wrong. Safe to render here, and only here: this call
           carries a request id and nothing else. The submit below is the
           opposite case. */
        setFailure(asIpcError(rejection)?.code ?? String(rejection).slice(0, 200));
      });

    void internalVaultStatus()
      .then((status) => setUsesVault(status !== 'notConfigured'))
      .catch(() => setUsesVault(false));
  }, [request]);

  useEffect(() => {
    /* The window opens focused, but the field inside it does not focus itself
       — and a password prompt where the first keystroke goes nowhere is one
       the user types their password into twice. */
    if (prompt !== null) first.current?.focus();
  }, [prompt, method]);

  /* Always calls, even with no request. The window's error state is reached
     when it could not find one, and that is the state where this button is the
     only thing left. The core closes the window either way. */
  const cancel = (): void => {
    void dismissCredential(request);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (request === null || busy) return;

    /* Read from the DOM, not from state, and never assigned to anything that
       outlives this call. */
    const fields = new FormData(event.currentTarget);
    const keep = (fields.get('keep') ?? 'never') as Keep;

    const secret =
      method === 'password'
        ? { password: String(fields.get('password') ?? '') }
        : {
            privateKey: String(fields.get('privateKey') ?? ''),
            passphrase: String(fields.get('passphrase') ?? '') || null,
          };

    setBusy(true);
    void submitCredential(request, secret, keep)
      .catch((rejection: unknown) => {
        setBusy(false);
        /* Deliberately not `String(rejection)`, which is what the failure
           above does. The arguments of *this* call are the secret, and a
           rejection that did not come from the core — a bridge or
           deserialization failure — is the kind that quotes what it could not
           read. Rendering it would put the password on the screen and in the
           DOM. CLAUDE.md 7.2: redact before the value can reach a formatter. */
        setFailure(asIpcError(rejection)?.code ?? 'submitFailed');
      })
      .finally(() => {
        /* Whatever happened, the fields do not stay filled. The window is
           about to be destroyed by the core, which is what actually discards
           the value; this is for the case where it is not. */
        form.current?.reset();
      });
  };

  if (failure !== null) {
    return (
      <SessionSurface
        variant="window"
        titleId="credential-failed"
        tone="danger"
        alert
        title={i18n.t('credential.failed')}
        icon={ALERT_ICON}
        body={<span className="text-ink-faint font-mono text-[11.5px]">{failure}</span>}
        actions={
          <SurfaceAction onClick={cancel} variant="secondary">
            {i18n.t('credential.cancel')}
          </SurfaceAction>
        }
      />
    );
  }

  if (prompt === null) {
    return (
      <main className="bg-surface-raised text-ink-faint flex h-full items-center justify-center text-[12.5px]">
        {i18n.t('credential.loading')}
      </main>
    );
  }

  return (
    /* The same shape the host key screens speak in, filling a window instead of
       floating in a panel. ADR-0015 made one shape for a session to talk to the
       user in because there had been five, and the user met three of them in
       three consecutive screens. This window had a sixth, which nothing caught
       because the rule was written about surfaces inside the main window and
       this one is not inside anything.

       The form wraps the surface rather than sitting inside it: the submit
       button is in the action row, which `SessionSurface` renders below the
       part that scrolls, and a button can only submit a form it is inside. */
    <form ref={form} onSubmit={onSubmit} className="h-full">
      <SessionSurface
        variant="window"
        titleId="credential-title"
        title={i18n.t(prompt.carrying === null ? 'credential.title' : 'credential.title.jump')}
        icon={KEY_ICON}
        body={i18n.t('credential.subject', {
          name: prompt.sessionName,
          user: prompt.user,
          host: prompt.host,
        })}
        actions={
          <>
            <SurfaceAction onClick={cancel} variant="secondary">
              {i18n.t('credential.cancel')}
            </SurfaceAction>
            <SurfaceAction type="submit" variant="primary" disabled={busy}>
              {i18n.t('credential.submit')}
            </SurfaceAction>
          </>
        }
      >
        {/* The whole of what ADR-0023 required before a jump host was allowed
            to ask at all. Two prompts arrive in a row for two different
            machines, and without this the second is indistinguishable from the
            first. The title changes with it rather than only this block,
            because a banner is a thing the eye learns to skip and a heading is
            not.

            The same geometry as `JumpHostNotice` on the host key screens, in
            warn rather than accent: that one says which host is being asked
            about, this one says the secret about to be typed belongs to a
            different machine than the one on the tab. */}
        {prompt.carrying !== null && (
          <p className="border-warn bg-warn-soft text-ink rounded border-l-2 px-3 py-2 text-[12.5px] leading-relaxed">
            {i18n.t('credential.hop.bastion', { target: prompt.carrying })}
          </p>
        )}

        <div
          role="radiogroup"
          aria-label={i18n.t('credential.method')}
          className="border-line-subtle bg-surface-base flex gap-1 rounded-lg border p-1"
        >
          {(['password', 'key'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={method === option}
              onClick={() => setMethod(option)}
              className={`h-[30px] flex-1 rounded-md text-[12.5px] font-semibold ${
                method === option
                  ? 'bg-surface-raised text-ink border-line-strong border'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {i18n.t(
                option === 'password' ? 'credential.method.password' : 'credential.method.key',
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {method === 'password' ? (
            <Field label={i18n.t('credential.password')}>
              <input
                ref={takeFirst}
                name="password"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className={INPUT}
              />
            </Field>
          ) : (
            <>
              {/* A height of its own, never `flex-1`. Inside a region that
                  scrolls, a child that grows to fill it has nothing to fill:
                  it collapses, and what follows lands on top of it. That is
                  twice this field has disappeared, by two different routes. */}
              <Field label={i18n.t('credential.privateKey')}>
                <textarea
                  ref={takeFirst}
                  name="privateKey"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${INPUT} h-[124px] resize-none text-[11px] leading-snug`}
                />
              </Field>
              <Field label={i18n.t('credential.passphrase')}>
                <input
                  name="passphrase"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className={INPUT}
                />
              </Field>
            </>
          )}

          {/* Three durations, each named. The middle one is the one most likely
              to be misread, so it says where it goes rather than only how long:
              somebody who restarts and is asked again has to be able to connect
              that to a choice they made an hour ago. ADR-0025.

              The last is absent rather than disabled when the machine has no
              keychain. A control that can never be used is a feature somebody
              is told about and then denied. */}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="text-ink-faint p-0 pb-1.5 text-[9.5px] font-bold tracking-[0.09em]">
              {i18n.t('credential.keep')}
            </legend>

            {(
              [
                'never',
                'forThisRun',
                ...(prompt.canRemember ? (['stored'] as const) : []),
              ] as const
            ).map((option) => (
              <label
                key={option}
                className="text-ink-secondary flex cursor-pointer items-center gap-2.5 text-[12.5px]"
              >
                <input
                  name="keep"
                  type="radio"
                  value={option}
                  defaultChecked={option === 'never'}
                  className="accent-accent h-3.5 w-3.5"
                />
                {i18n.t(
                  option === 'stored' && usesVault ? 'credential.keep.stored.vault' : `credential.keep.${option}`,
                )}
              </label>
            ))}
          </fieldset>
        </div>
      </SessionSurface>
    </form>
  );
}

/** The one input treatment, so the three fields cannot drift apart. */
const INPUT =
  'bg-surface-base border-line-subtle text-ink rounded-lg border px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent';

/** A labelled field, in the scale the host key screens use for theirs. */
function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-faint text-[9.5px] font-bold tracking-[0.09em]">{label}</span>
      {children}
    </label>
  );
}

const KEY_ICON = (
  <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
    <path
      d="M9.6 6.4a3 3 0 1 0-3.2 3.2L7 10.2l-.6.6.9.9-.9.9.9.9 2-2 3.3-3.3a3 3 0 0 0-3-2.1zM5.4 5.4h.01"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ALERT_ICON = (
  <svg viewBox="0 0 16 16" width="19" height="19" fill="none" aria-hidden="true">
    <path
      d="M8 1.8 1.5 13.2h13L8 1.8ZM8 6.2v3.4M8 11.4h.01"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
