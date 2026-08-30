//! Collecting a bastion's credential without a caller-owned window.
//!
//! ADR-0008 put every credential prompt in a dedicated window; ADR-0039
//! retired it once the wizard became the only place a credential is set or
//! recovered (ADR-0034) and Sessions had nothing left to prompt for on its
//! own. What remains is the request/answer protocol `ask_inline`
//! (ADR-0033) still uses for a bastion crossed mid-chain during the wizard's
//! own test: an opaque request id, a prompt readable by that id, an answer
//! sent down a channel. None of that was ever window-specific.

use tauri::{AppHandle, Emitter, Runtime, State};

use crate::commands::sessions::to_stored;
use crate::error::{Error, IpcError};
use crate::ssh::credentials::{Answer, CredentialPrompt, CredentialRequests, Keep, RequestId};
use crate::vault::{Secret, StoredCredential};

/// What the bastion's inline form renders.
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

/// The reply from the bastion's inline form.
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

    /* An unmatched or repeated id is refused. That is also what stops a
    request left over from an earlier, abandoned test from authenticating a
    session nobody asked it about. */
    if delivered {
        Ok(())
    } else {
        Err(Error::UnknownRequest.into())
    }
}

/// The user cancelled the wizard's own bastion prompt.
///
/// The only caller left is ADR-0033's inline form; there is no window for
/// this to close, only the request to answer, the same as any other
/// dismissal `CredentialRequests` already handles.
#[tauri::command]
pub async fn dismiss_credential(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
) -> Result<(), IpcError> {
    requests.answer(request, Answer::Dismissed).await;
    Ok(())
}

/// The event an inline request's id arrives on.
pub const INLINE_CREDENTIAL_EVENT: &str = "credential://inline-request";

/// Asks for a bastion's credential inline, ADR-0033.
///
/// `CredentialRequests` is an opaque id, a prompt readable by that id, an
/// answer sent down a channel; nothing about it is specific to how the
/// answer arrives. This emits the id for the wizard's own test, in flight
/// on the same call, to pick up and answer through `submit_credential`.
pub(crate) async fn ask_inline<R: Runtime>(
    app: &AppHandle<R>,
    requests: &CredentialRequests,
    prompt: CredentialPrompt,
) -> Result<(StoredCredential, Keep), Error> {
    let (request, answer) = requests.open(prompt).await;

    /* A failed emit means every window is gone, which is what shutting down
    looks like from here, and there is equally nobody left to answer. */
    let _ = app.emit(INLINE_CREDENTIAL_EVENT, request.raw());

    let answer = answer.await.map_err(|_| Error::CredentialDismissed)?;

    match answer {
        Answer::Submitted { credential, keep } => Ok((credential, keep)),
        Answer::Dismissed => Err(Error::CredentialDismissed),
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
}
