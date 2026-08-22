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
use crate::ssh::credentials::{Answer, CredentialPrompt, CredentialRequests, RequestId};
use crate::ssh::registry::{Busy, Registry, SessionHandle};
use crate::vault::{Availability, Vault};

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
    handle: SessionHandle,
) -> Result<(), IpcError> {
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
    };

    let (request, answer) = requests.open(prompt).await;

    if let Err(failure) = open_window(&app, request) {
        /* Nobody can answer a window that did not open, so the request is
        closed here rather than left for a reply that cannot arrive. */
        requests.answer(request, Answer::Dismissed).await;
        return Err(failure.into());
    }

    /* The sender is held by the request; it is answered by a submit, by a
    cancel, or by the window's own close event. There is no fourth way for
    this to resolve, which is what keeps a connection from waiting forever. */
    let answer = answer.await.map_err(|_| Error::CredentialDismissed)?;

    close_window(&app);

    let Answer::Submitted {
        credential,
        remember,
    } = answer
    else {
        return Err(Error::CredentialDismissed.into());
    };

    /* Encoded before authenticating, because authenticating consumes the
    credential. Written only once the host has accepted it: saving a secret
    the server refused is how a keychain fills up with typos. */
    let keepsake = if remember {
        Some(credential.encode()?)
    } else {
        None
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

    if let Some(secret) = keepsake {
        /* A keychain that refuses must not undo a connection that worked. The
        session is authenticated either way; the interface can offer to save
        again. */
        let _ = persist_credential(&app, &vault, &session_id, &secret);
    }

    Ok(())
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
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
    remember: bool,
) -> Result<(), IpcError> {
    let credential = to_stored(password, private_key, passphrase)?;

    let delivered = requests
        .answer(
            request,
            Answer::Submitted {
                credential,
                remember,
            },
        )
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

/// The user cancelled.
#[tauri::command]
pub async fn dismiss_credential(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
) -> Result<(), IpcError> {
    requests.answer(request, Answer::Dismissed).await;
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
fn open_window<R: Runtime>(app: &AppHandle<R>, request: RequestId) -> Result<(), Error> {
    /* A window left over from an abandoned attempt would take the label and
    make this one fail to build. */
    close_window(app);

    let url = format!("{CREDENTIAL_DOCUMENT}?request={request}");

    let window = WebviewWindowBuilder::new(app, CREDENTIAL_WINDOW, WebviewUrl::App(url.into()))
        .title("Runic SSH")
        .inner_size(440.0, 340.0)
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
}
