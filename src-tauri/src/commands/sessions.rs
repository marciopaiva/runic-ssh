//! Session commands.
//!
//! Thin by design. Each handler resolves what it needs, calls into a domain
//! module, and maps the failure — the logic they call is testable without a
//! webview, which is the arrangement `docs/architecture.md` asks for.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::config::sessions::{Session, SessionStore};
use crate::error::{Error, IpcError};
use crate::ssh::connection::{connect, Credential, Endpoint};
use crate::ssh::known_hosts::KnownHosts;
use crate::ssh::registry::{Open, Registry, SessionHandle};

pub const KNOWN_HOSTS_FILE: &str = "known_hosts";

/// What the frontend gets back from a successful connect.
///
/// A handle and the facts needed to label a tab. No socket, no key, no
/// credential — rule 1.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSession {
    pub handle: SessionHandle,
    pub session_id: String,
    pub name: String,
    /// Whether the connection still needs a credential before it is usable.
    pub authenticated: bool,
}

fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, Error> {
    app.path()
        .app_config_dir()
        .map_err(|_| Error::ConfigDirUnavailable)
}

fn saved_session<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Session, Error> {
    let store = SessionStore::new(config_dir(app)?);
    store
        .load()?
        .find(id)
        .cloned()
        .ok_or_else(|| Error::UnknownSession { id: id.to_owned() })
}

fn known_hosts<R: Runtime>(app: &AppHandle<R>) -> Result<KnownHosts, Error> {
    let path = config_dir(app)?.join(KNOWN_HOSTS_FILE);

    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(KnownHosts::parse(&text)),
        /* No file yet means no host is trusted yet, which is the correct
        starting point rather than an error. */
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(KnownHosts::default()),
        Err(source) => Err(Error::SettingsUnreadable { path, source }),
    }
}

/// Opens a connection to a saved session and verifies its host key.
///
/// Returns before authentication: the credential is collected separately, in
/// its own window, and submitted through [`authenticate_session`]. See
/// ADR-0008.
#[tauri::command]
pub async fn connect_session<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    session_id: String,
) -> Result<OpenSession, IpcError> {
    let session = saved_session(&app, &session_id)?;
    let known = known_hosts(&app)?;

    let endpoint = Endpoint {
        host: session.host.clone(),
        port: session.port,
    };
    let connection = connect(endpoint, known).await.map_err(Box::new)?;

    let handle = registry
        .insert(Open {
            connection,
            session_id: session.id.clone(),
            user: session.user.clone(),
        })
        .await;

    Ok(OpenSession {
        handle,
        session_id: session.id,
        name: session.name,
        authenticated: false,
    })
}

/// Proves who we are on an already-open connection.
///
/// The secret arrives, is used, and is dropped inside this call. It is never
/// stored, never echoed back, and never reaches a log.
#[tauri::command]
pub async fn authenticate_session(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<(), IpcError> {
    let credential = build_credential(password, private_key, passphrase)?;

    /* The user comes from the handle, not from the session file. Re-reading the
    file here would authenticate as whoever it happens to list now, which is
    not necessarily who this connection was opened as. */
    let outcome = registry
        .with(handle, |mut open: Open| async move {
            let result = open.connection.authenticate(&open.user, credential).await;
            (open, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    outcome.map_err(Box::new)?;
    Ok(())
}

/// Closes a connection politely and forgets its handle.
#[tauri::command]
pub async fn disconnect_session(
    registry: State<'_, Registry>,
    handle: SessionHandle,
) -> Result<(), IpcError> {
    let open = registry.take(handle).await.ok_or(Error::UnknownHandle)?;
    open.connection.disconnect().await.map_err(Box::new)?;
    Ok(())
}

/// Turns the three optional fields into exactly one credential.
///
/// Kept separate so the refusals are testable without a webview: the shape the
/// webview sends is a wire format, and a wire format is something to validate,
/// not to trust.
pub fn build_credential(
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
) -> Result<Credential, Error> {
    use zeroize::Zeroizing;

    match (password, private_key) {
        (Some(_), Some(_)) => Err(Error::AmbiguousCredential),
        (Some(password), None) => Ok(Credential::Password(Zeroizing::new(password))),
        (None, Some(pem)) => Ok(Credential::PrivateKey {
            pem: Zeroizing::new(pem),
            passphrase: passphrase.map(Zeroizing::new),
        }),
        (None, None) => Err(Error::MissingCredential),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_password_becomes_a_password_credential() {
        let credential = build_credential(Some("hunter2".to_owned()), None, None).expect("built");
        assert!(matches!(credential, Credential::Password(_)));
    }

    #[test]
    fn a_key_carries_its_passphrase() {
        let credential = build_credential(
            None,
            Some("-----BEGIN-----".to_owned()),
            Some("phrase".to_owned()),
        )
        .expect("built");

        assert!(matches!(
            credential,
            Credential::PrivateKey {
                passphrase: Some(_),
                ..
            }
        ));
    }

    #[test]
    fn sending_both_is_refused_rather_than_guessed() {
        /* Picking one would mean the frontend and the core disagree about
        which secret was used, and the user would be told the wrong thing
        when it fails. */
        assert!(matches!(
            build_credential(Some("a".to_owned()), Some("b".to_owned()), None),
            Err(Error::AmbiguousCredential)
        ));
    }

    #[test]
    fn sending_neither_is_refused() {
        assert!(matches!(
            build_credential(None, None, Some("orphan".to_owned())),
            Err(Error::MissingCredential)
        ));
    }
}
