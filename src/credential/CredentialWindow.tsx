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
      .then(setPrompt)
      .catch((rejection: unknown) => {
        /* The real rejection, not a guess at it. An earlier version fell back
           to 'unknownRequest' for anything it could not parse, which meant
           every failure in here read as the same one and hid what was
           actually wrong. Safe to render here, and only here: this call
           carries a request id and nothing else. The submit below is the
           opposite case. */
        setFailure(asIpcError(rejection)?.code ?? String(rejection).slice(0, 200));
      });
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
      <main className="bg-surface-base text-ink flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-danger-text text-[13px] font-semibold">
          {i18n.t('credential.failed')}
        </p>
        <p className="text-ink-faint font-mono text-[11px]">{failure}</p>
        <button
          type="button"
          onClick={cancel}
          className="border-line-strong text-ink-secondary hover:text-ink mt-1 rounded border px-3 py-1.5 text-[12px]"
        >
          {i18n.t('credential.cancel')}
        </button>
      </main>
    );
  }

  if (prompt === null) {
    return (
      <main className="bg-surface-base text-ink-faint flex h-full items-center justify-center text-[12px]">
        {i18n.t('credential.loading')}
      </main>
    );
  }

  return (
    /* Two regions, and which is which is the whole point. Everything that can
       grow scrolls. The two buttons never do.

       The core sizes this window for what it is about to render, and that is a
       number in Rust measured against a component in a webview, in three
       languages. The two will disagree. What has to survive the disagreement is
       the window staying answerable, and a scrollbar on its own did not give
       that: with a private key asked for, Cancel and Authenticate went past the
       bottom edge, so the window could be read and not answered. #188.

       Unreachable now by construction rather than by choosing the height
       carefully, which is what was tried and what shipped anyway. */
    <main className="bg-surface-base text-ink flex h-full flex-col p-5">
      <form ref={form} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <h1 className="text-[13.5px] font-semibold">
            {i18n.t(prompt.carrying === null ? 'credential.title' : 'credential.title.jump')}
          </h1>
          <p className="text-ink-secondary mt-1 text-[12px]">
            {i18n.t('credential.subject', {
              name: prompt.sessionName,
              user: prompt.user,
              host: prompt.host,
            })}
          </p>

          {/* The whole of what ADR-0023 required before a jump host was allowed to
              ask at all. Two prompts arrive in a row for two different machines,
              and without this the second is indistinguishable from the first. The
              title changes with it rather than only this block, because a banner is
              a thing the eye learns to skip and a heading is not. */}
          {prompt.carrying !== null && (
            <p className="bg-warn-soft text-warn border-warn/40 mt-3 rounded border px-2.5 py-1.5 text-[11.5px]">
              {i18n.t('credential.hop.bastion', { target: prompt.carrying })}
            </p>
          )}

          <div
            role="radiogroup"
            aria-label={i18n.t('credential.method')}
            className="border-line-subtle mt-4 flex gap-1 rounded border p-0.5"
          >
            {(['password', 'key'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={method === option}
                onClick={() => setMethod(option)}
                className={`flex-1 rounded px-2 py-1 text-[12px] ${
                  method === option ? 'bg-surface-raised text-ink' : 'text-ink-muted'
                }`}
              >
                {i18n.t(option === 'password' ? 'credential.method.password' : 'credential.method.key')}
              </button>
            ))}
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
            {method === 'password' ? (
              <label className="flex flex-col gap-1">
                <span className="text-ink-muted text-[11px]">{i18n.t('credential.password')}</span>
                <input
                  ref={takeFirst}
                  name="password"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="bg-surface-input border-line-subtle text-ink rounded border px-2.5 py-1.5 font-mono text-[12.5px] outline-none"
                />
              </label>
            ) : (
              <>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-ink-muted text-[11px]">{i18n.t('credential.privateKey')}</span>
                  <textarea
                    ref={takeFirst}
                    name="privateKey"
                    autoComplete="off"
                    spellCheck={false}
                    className="bg-surface-input border-line-subtle text-ink min-h-[104px] flex-1 resize-none rounded border px-2.5 py-1.5 font-mono text-[11px] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted text-[11px]">{i18n.t('credential.passphrase')}</span>
                  <input
                    name="passphrase"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="bg-surface-input border-line-subtle text-ink rounded border px-2.5 py-1.5 font-mono text-[12.5px] outline-none"
                  />
                </label>
              </>
            )}

            {/* Three durations, each named. The middle one is the one most likely
                to be misread, so it says where it goes rather than only how long:
                somebody who restarts and is asked again has to be able to connect
                that to a choice they made an hour ago. ADR-0025.

                The last is absent rather than disabled when the machine has no
                keychain. A control that can never be used is a feature somebody is
                told about and then denied. */}
            <fieldset className="m-0 mt-1 flex flex-col gap-1.5 border-0 p-0">
              <legend className="text-ink-faint p-0 pb-1 text-[11px]">
                {i18n.t('credential.keep')}
              </legend>

              {(['never', 'forThisRun', ...(prompt.canRemember ? (['stored'] as const) : [])] as const).map(
                (option) => (
                  <label key={option} className="text-ink-secondary flex items-center gap-2 text-[12px]">
                    <input
                      name="keep"
                      type="radio"
                      value={option}
                      defaultChecked={option === 'never'}
                      className="accent-accent"
                    />
                    {i18n.t(`credential.keep.${option}`)}
                  </label>
                ),
              )}
            </fieldset>
          </div>
        </div>

        {/* Outside the scrolling region, so nothing above can push them
            off the bottom of the window. */}
        <div className="flex justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={cancel}
            className="border-line-strong text-ink-secondary hover:text-ink rounded border px-3 py-1.5 text-[12px]"
          >
            {i18n.t('credential.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="bg-accent text-surface-base rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {i18n.t('credential.submit')}
          </button>
        </div>
      </form>
    </main>
  );
}
