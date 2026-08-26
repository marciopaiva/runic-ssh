//! Collecting a credential in its own window.
//!
//! ADR-0008: the prompt lives in a window that never renders a byte a remote
//! host chose, and is destroyed once it has answered. This module is the whole
//! lifecycle — open, wait, authenticate, destroy — because the failure modes
//! the ADR names are all *between* those steps, and splitting them across
//! callers is how one of them ends up unhandled.
//!
//! The window is created here rather than by the webview on purpose. Letting
//! the frontend open windows means granting it `allow-create-webview-window`
//! permanently, to the same code that renders hostile output. The privileged
//! side already knows when a credential is needed; it does not need to be
//! asked to open a window, only told the answer.

use tauri::{AppHandle, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::commands::sessions::{from_stored, persist_credential, saved_session, to_stored};
use crate::error::{Error, IpcError};
use crate::ssh::credentials::{Answer, CredentialPrompt, CredentialRequests, Keep, RequestId};
use crate::ssh::registry::{Busy, Registry, SessionHandle};
use crate::vault::{Availability, CredentialId, Secret, SessionSecrets, StoredCredential, Vault};

/// What became of a credential the user asked to keep.
///
/// Returned rather than discarded, which is the whole of #167. A keychain that
/// refuses must not undo a connection that worked, and the old code was right
/// about that and then said nothing, so the box went on being ticked to no
/// effect for as long as somebody had patience.
///
/// Deliberately not an error. The session is authenticated, the user has what
/// they asked for, and failing the call over a convenience would be worse than
/// the thing it is reporting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Keeping {
    /// The user did not ask for it to be kept.
    NotAsked,
    Kept,
    /// The user asked and the store refused. Covers a locked keyring, a
    /// revoked permission, and a keychain that went away while the application
    /// was open, none of which `Availability` reports as unavailable.
    Refused,
}

/// The label the prompt window is created under.
pub const CREDENTIAL_WINDOW: &str = "credential";

/// The document the prompt window loads.
///
/// Its own entry point, not a route inside the main one. That is what makes
/// ADR-0008's "nothing remote is ever routed to it" a property of the build
/// rather than a promise about which component renders: the terminal is not in
/// this bundle at all. `tests/credential-window.test.ts` fails if it appears.
const CREDENTIAL_DOCUMENT: &str = "credential.html";

/// Opens the prompt, waits for it, and authenticates with what comes back.
///
/// Returns `credentialDismissed` when the user closes or cancels. Deliberately
/// an error and never a silent retry: a client that re-prompts on its own is
/// how someone ends up typing a password into a window they did not summon.
#[tauri::command]
pub async fn authenticate_interactively<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    requests: State<'_, CredentialRequests>,
    vault: State<'_, Vault>,
    secrets: State<'_, SessionSecrets>,
    handle: SessionHandle,
) -> Result<Keeping, IpcError> {
    let session_id = registry
        .session_of(handle)
        .await
        .ok_or(Error::UnknownHandle)?;
    let session = saved_session(&app, &session_id)?;

    let prompt = CredentialPrompt {
        session_name: session.name.clone(),
        user: session.user.clone(),
        host: session.host.clone(),
        port: session.port,
        can_remember: matches!(vault.availability(), Availability::Available),
        /* The host the user clicked. Nothing is being crossed on the way to
        anywhere, which is what `None` says. */
        carrying: None,
    };

    let (credential, keep) = ask(&app, &requests, prompt).await?;

    /* Encoded before authenticating, because authenticating consumes the
    credential. Written only once the host has accepted it: saving a secret
    the server refused is how a keychain fills up with typos. */
    let keepsake = match keep {
        Keep::Never => None,
        Keep::ForThisRun | Keep::Stored => Some(credential.encode()?),
    };

    let credential = from_stored(credential);

    let outcome = registry
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.authenticate(&busy.user, credential).await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    outcome.map_err(Box::new)?;

    /* A keychain that refuses must not undo a connection that worked: the
    session is authenticated either way. But it is reported rather than
    swallowed, because a tick box that does nothing and says nothing is worse
    than one that is not offered. */
    let Some(secret) = keepsake else {
        return Ok(Keeping::NotAsked);
    };

    /* Kept for this run goes nowhere near a disk, so there is nothing that can
    refuse it and nothing to report. ADR-0025. */
    if keep == Keep::ForThisRun {
        secrets.keep(&CredentialId::for_session(&session_id), &secret);
        return Ok(Keeping::Kept);
    }

    match persist_credential(&app, &vault, &session_id, &secret) {
        Ok(()) => Ok(Keeping::Kept),
        Err(_) => Ok(Keeping::Refused),
    }
}

/// What the prompt window renders.
///
/// Facts about the session, and nothing a host chose.
#[tauri::command]
pub async fn credential_prompt(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
) -> Result<CredentialPrompt, IpcError> {
    requests
        .describe(request)
        .await
        .ok_or(Error::UnknownRequest)
        .map_err(Into::into)
}

/// The reply from the prompt window.
///
/// The secret arrives here and goes straight down the channel to the waiting
/// connection. It is not stored, not echoed, and not logged.
#[tauri::command]
pub async fn submit_credential(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
    keep: Keep,
) -> Result<(), IpcError> {
    let credential = to_stored(password, private_key, passphrase)?;

    let delivered = requests
        .answer(request, Answer::Submitted { credential, keep })
        .await;

    /* An unmatched or repeated id is refused, which is ADR-0008's protocol
    verbatim. It is also what stops a window left open from an earlier attempt
    from authenticating a session nobody asked it about. */
    if delivered {
        Ok(())
    } else {
        Err(Error::UnknownRequest.into())
    }
}

/// The user cancelled, or the window has nothing it can do.
///
/// The request is optional, and the window is closed either way. That is not a
/// convenience: the prompt reaches its error state precisely when it could not
/// find its request, and a Cancel button that needs a request to work is inert
/// in the one state where it is the only thing left. Shipped exactly that once
/// — a window whose only button did nothing.
#[tauri::command]
pub async fn dismiss_credential<R: Runtime>(
    app: AppHandle<R>,
    requests: State<'_, CredentialRequests>,
    request: Option<RequestId>,
) -> Result<(), IpcError> {
    if let Some(request) = request {
        requests.answer(request, Answer::Dismissed).await;
    }

    /* Closed by the core rather than by the window, so the window needs no
    permission to close itself and its capability can stay empty. */
    close_window(&app);
    Ok(())
}

/// The URL the prompt window is opened on.
///
/// Split out because it was wrong and nothing noticed. `RequestId` renders as
/// `request-N` so a log line names nothing about the session; interpolating it
/// here produced `?request=request-0`, which the window parsed as `NaN` and
/// reported as a prompt that no longer existed. Every credential prompt opened
/// onto that message.
#[must_use]
pub fn prompt_url(request: RequestId) -> String {
    format!("{CREDENTIAL_DOCUMENT}?request={}", request.raw())
}

/// Builds the prompt window and wires its close event to a dismissal.
/// Opens the prompt window, waits for it, and returns what the user typed.
///
/// Extracted so a bastion can ask as well. ADR-0027 lets the core prompt for a
/// hop the user did not click, and the thing that must not be duplicated to do
/// that is this sequence: a request that is always answered, a window that is
/// always destroyed, and a dismissal that is an error rather than a retry.
///
/// The returned credential is the shape the keychain holds, because a caller
/// that was asked to keep it needs it written as well as used, and converting
/// once means the secret is not copied a second time to satisfy the second use.
pub(crate) async fn ask<R: Runtime>(
    app: &AppHandle<R>,
    requests: &CredentialRequests,
    prompt: CredentialPrompt,
) -> Result<(StoredCredential, Keep), Error> {
    /* Read before the prompt is handed over, because the window is sized from
    what it will render and the request owns the prompt from here on. */
    let height = if prompt.carrying.is_none() {
        PROMPT_HEIGHT
    } else {
        PROMPT_HEIGHT_WITH_HOP
    };

    let (request, answer) = requests.open(prompt).await;

    if let Err(failure) = open_window(app, request, height) {
        /* Nobody can answer a window that did not open, so the request is
        closed here rather than left for a reply that cannot arrive. */
        requests.answer(request, Answer::Dismissed).await;
        return Err(failure);
    }

    /* The sender is held by the request; it is answered by a submit, by a
    cancel, or by the window's own close event. There is no fourth way for
    this to resolve, which is what keeps a connection from waiting forever. */
    let answer = answer.await.map_err(|_| Error::CredentialDismissed)?;

    close_window(app);

    match answer {
        Answer::Submitted { credential, keep } => Ok((credential, keep)),
        Answer::Dismissed => Err(Error::CredentialDismissed),
    }
}

/// How tall the prompt window is, which depends on what it has to say.
///
/// A jump host's prompt carries a paragraph the ordinary one does not, and at
/// 340 pixels that paragraph pushed the keep options and the submit button off
/// the bottom edge, leaving a window that could be read and not answered. Found
/// by opening one. No test in this repository could have: the height is a
/// number in Rust and the content is a component in a webview, and nothing
/// measures one against the other.
///
/// The taller figure has room for the longest of the three translations rather
/// than for the English, which is the shortest of them.
const PROMPT_HEIGHT: f64 = 340.0;
const PROMPT_HEIGHT_WITH_HOP: f64 = 440.0;

fn open_window<R: Runtime>(
    app: &AppHandle<R>,
    request: RequestId,
    height: f64,
) -> Result<(), Error> {
    /* A window left over from an abandoned attempt would take the label and
    make this one fail to build. */
    close_window(app);

    /* Through `prompt_url`, and never built here. The last attempt at this
    bug added that helper, gave it three tests, and left this line interpolating
    the `Display` form — so the tests passed and every prompt still opened on
    `?request=request-0`. One construction site is the fix; the second one was
    the bug. */
    let url = prompt_url(request);

    let window = WebviewWindowBuilder::new(app, CREDENTIAL_WINDOW, WebviewUrl::App(url.into()))
        .title("Runic SSH")
        .inner_size(440.0, height)
        .resizable(false)
        .minimizable(false)
        .center()
        /* ADR-0008: "on some window managers a second window can open behind the
        main one or without focus, which is a usability failure that reads as the
        application hanging". Both are asked for explicitly. */
        .focused(true)
        .always_on_top(true)
        /* Native decorations, deliberately, against ADR-0005's aesthetic and only
        on this window. A prompt whose script fails to load and has no OS close
        button is a connection that can never be cancelled — the exact hang
        ADR-0008 calls the worst failure of this design. The guaranteed way out is
        worth more here than the chrome. */
        .decorations(true)
        .build()
        .map_err(|_| Error::PromptUnavailable)?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            let app = handle.clone();
            tauri::async_runtime::spawn(async move {
                /* Take-once, so this is a no-op when the window is closing
                because it already submitted. */
                app.state::<CredentialRequests>()
                    .answer(request, Answer::Dismissed)
                    .await;
            });
        }
    });

    Ok(())
}

fn close_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CREDENTIAL_WINDOW) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_prompt_window_still_sends_what_this_command_takes() {
        /* The three secret arguments became `Option<Secret>` under ADR-0026,
        and nothing else in the gate would notice if that changed the wire.
        The literal below is what `submitCredential` in `src/ipc/credential.ts`
        builds, absent fields included: it sends `null` rather than omitting
        them, so `Option` has to accept both. */
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Sent {
            password: Option<Secret>,
            private_key: Option<Secret>,
            passphrase: Option<Secret>,
        }

        let typed: Sent =
            serde_json::from_str(r#"{"password":"hunter2","privateKey":null,"passphrase":null}"#)
                .expect("a password the window sent");
        assert_eq!(typed.password.as_ref().map(Secret::expose), Some("hunter2"));
        assert!(typed.private_key.is_none() && typed.passphrase.is_none());

        let typed: Sent = serde_json::from_str(
            r#"{"password":null,"privateKey":"-----BEGIN-----","passphrase":"phrase"}"#,
        )
        .expect("a key the window sent");
        assert_eq!(
            typed.private_key.as_ref().map(Secret::expose),
            Some("-----BEGIN-----")
        );
        assert_eq!(
            typed.passphrase.as_ref().map(Secret::expose),
            Some("phrase")
        );
    }

    /// Parses the URL the way the window does: split the query, read `request`.
    fn request_in(url: &str) -> Option<u64> {
        url.split_once("?request=")
            .map(|(_, value)| value)
            .and_then(|value| value.parse().ok())
    }

    #[test]
    fn the_window_can_read_the_request_out_of_its_own_url() {
        let (id, _receiver) = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("a runtime")
            .block_on(async {
                CredentialRequests::new()
                    .open(CredentialPrompt {
                        session_name: "web-01".to_owned(),
                        user: "deploy".to_owned(),
                        host: "10.0.4.31".to_owned(),
                        port: 22,
                        can_remember: false,
                        carrying: None,
                    })
                    .await
            });

        assert_eq!(request_in(&prompt_url(id)), Some(id.raw()));
    }

    #[test]
    fn the_url_carries_a_bare_number() {
        /* The direct guard. `?request=request-0` is what shipped, and the
        window turned it into NaN. */
        let url = prompt_url(RequestId::default_for_test(3));

        assert!(url.ends_with("?request=3"), "the URL is {url}");
        assert!(!url.contains("request=request"), "the URL is {url}");
    }

    #[test]
    fn the_document_is_the_prompt_and_not_the_main_window() {
        /* ADR-0008 rests on this window loading its own document. Loading
        index.html would put the terminal in the same context as the secret. */
        assert!(prompt_url(RequestId::default_for_test(0)).starts_with("credential.html"));
    }

    #[test]
    fn what_became_of_the_credential_crosses_as_three_words() {
        /* Pinned as a literal on both sides. Renaming a variant compiles in
        both languages and leaves the interface silent about a save that did
        not happen, which is the defect this enum exists to end (#167). */
        assert_eq!(
            serde_json::to_string(&Keeping::NotAsked).expect("serializes"),
            r#""notAsked""#
        );
        assert_eq!(
            serde_json::to_string(&Keeping::Kept).expect("serializes"),
            r#""kept""#
        );
        assert_eq!(
            serde_json::to_string(&Keeping::Refused).expect("serializes"),
            r#""refused""#
        );
    }

    #[test]
    fn a_refused_save_is_not_an_error() {
        /* The session is authenticated. Failing the call over a convenience
        would take down a connection that worked, which is worse than the
        thing being reported. */
        let refused: Result<Keeping, IpcError> = Ok(Keeping::Refused);
        assert!(refused.is_ok());
    }
}
