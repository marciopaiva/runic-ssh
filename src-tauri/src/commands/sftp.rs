//! SFTP commands.
//!
//! Listing answers directly; a transfer returns a handle immediately and
//! reports its own progress and outcome as events keyed by that handle,
//! the same shape `commands::terminal` already uses for output. Choosing
//! the local half of a transfer is its own pair of commands, backed by the
//! native picker (ADR-0042), since a cancelled dialog is not a failed
//! transfer and has no reason to share a command with one.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::{Error, IpcError};
use crate::sftp::session::{self, SftpSession};
use crate::sftp::transfer::{TransferHandle, Transfers};
use crate::ssh::registry::{Registry, SessionHandle};

/// A batch of progress for a transfer in flight.
pub const PROGRESS_EVENT: &str = "sftp://progress";
/// A transfer's outcome, once and only once, whichever way it ended.
pub const FINISHED_EVENT: &str = "sftp://finished";

/// One directory entry, typed for the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub remote_path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_unix_secs: Option<i64>,
}

impl From<session::Entry> for SftpEntry {
    fn from(entry: session::Entry) -> Self {
        Self {
            name: entry.name,
            remote_path: entry.remote_path,
            is_dir: entry.is_dir,
            is_symlink: entry.is_symlink,
            size: entry.size,
            modified_unix_secs: entry.modified_unix_secs,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    transfer: TransferHandle,
    transferred: u64,
    total: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
enum Outcome {
    Succeeded {
        /// The local path a download landed at, or the remote path an
        /// upload was sent to. Whichever side this process did not
        /// already know before the transfer started.
        path: String,
    },
    Failed {
        error: IpcError,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FinishedEvent {
    transfer: TransferHandle,
    #[serde(flatten)]
    outcome: Outcome,
}

/// Opens an SFTP session on `handle`'s connection.
///
/// The lock on the connection's own mutex is held only for the moment this
/// costs: `session::open` returns an independent [`SftpSession`], and the
/// guard here is dropped as soon as it does, the same rule
/// `commands::terminal::open_terminal` already follows for opening a shell.
///
/// Fails as `Error::UnknownHandle` whether the handle names nothing or the
/// connection behind it is gone, never as a separate "not connected": the
/// frontend cannot tell those apart either, and only one of them means the
/// tab it is looking at is stale.
async fn open_session(registry: &Registry, handle: SessionHandle) -> Result<SftpSession, Error> {
    let shared = registry.shared(handle).await.ok_or(Error::UnknownHandle)?;
    let held = shared.lock().await;
    let connection = held.as_ref().ok_or(Error::UnknownHandle)?;
    session::open(connection)
        .await
        .map_err(|error| Error::Sftp(Box::new(error)))
}

/// Lists a remote directory.
#[tauri::command]
pub async fn sftp_list(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    path: String,
) -> Result<Vec<SftpEntry>, IpcError> {
    let sftp = open_session(&registry, handle).await?;
    let entries = session::list(&sftp, &path)
        .await
        .map_err(|error| Error::Sftp(Box::new(error)))?;

    Ok(entries.into_iter().map(SftpEntry::from).collect())
}

/// One local directory entry. ADR-0043.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_unix_secs: Option<i64>,
}

impl From<crate::sftp::local::LocalEntry> for LocalEntry {
    fn from(entry: crate::sftp::local::LocalEntry) -> Self {
        Self {
            name: entry.name,
            path: entry.path.display().to_string(),
            is_dir: entry.is_dir,
            is_symlink: entry.is_symlink,
            size: entry.size,
            modified_unix_secs: entry.modified_unix_secs,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<LocalEntry>,
}

/// Lists a local directory, defaulting to the user's home directory when
/// none is given.
///
/// `std::fs::read_dir` and the `stat` call on every entry are blocking
/// syscalls; `spawn_blocking` is what keeps a large local directory from
/// stalling every other command this process is mid-way through, the same
/// rule section 6 states for the filesystem generally.
#[tauri::command]
pub async fn local_list_directory<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
) -> Result<LocalListing, IpcError> {
    let target = match path {
        Some(path) => PathBuf::from(path),
        None => app
            .path()
            .home_dir()
            .map_err(|_| Error::LocalDirectory(crate::sftp::local::LocalError::Io))?,
    };

    let listing = tokio::task::spawn_blocking(move || crate::sftp::local::list(&target))
        .await
        .map_err(|_| Error::LocalDirectory(crate::sftp::local::LocalError::Io))?
        .map_err(Error::LocalDirectory)?;

    Ok(LocalListing {
        path: listing.path.display().to_string(),
        parent: listing.parent.map(|p| p.display().to_string()),
        entries: listing.entries.into_iter().map(LocalEntry::from).collect(),
    })
}

/// Shows the native "choose a folder" dialog for a download's destination.
///
/// `None` on cancellation, which is not a failure: the user changed their
/// mind, and nothing was asked for that a retry would answer differently.
#[tauri::command]
pub async fn sftp_choose_download_destination<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    pick_folder(&app)
        .await
        .map(|path| path.display().to_string())
}

/// Shows the native "choose a file" dialog for an upload's source.
#[tauri::command]
pub async fn sftp_choose_upload_source<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    pick_file(&app).await.map(|path| path.display().to_string())
}

async fn pick_folder<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |picked| {
        let _ = sender.send(picked);
    });
    receiver.await.ok().flatten()?.into_path().ok()
}

async fn pick_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |picked| {
        let _ = sender.send(picked);
    });
    receiver.await.ok().flatten()?.into_path().ok()
}

/// Starts a download, and returns immediately with a handle for its
/// progress and outcome, which arrive as events.
#[tauri::command]
pub async fn sftp_download<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    transfers: State<'_, Transfers>,
    handle: SessionHandle,
    remote_path: String,
    local_dir: String,
) -> Result<TransferHandle, IpcError> {
    let sftp = open_session(&registry, handle).await?;
    let local_dir = PathBuf::from(local_dir);
    let transfer = transfers.reserve();

    let task = tokio::spawn(run_download(
        app.clone(),
        sftp,
        remote_path,
        local_dir,
        transfer,
    ));
    transfers.attach(transfer, task).await;

    Ok(transfer)
}

async fn run_download<R: Runtime>(
    app: AppHandle<R>,
    sftp: SftpSession,
    remote_path: String,
    local_dir: PathBuf,
    transfer: TransferHandle,
) {
    let progress_app = app.clone();
    let result = session::download(&sftp, &remote_path, &local_dir, move |progress| {
        let _ = progress_app.emit(
            PROGRESS_EVENT,
            ProgressEvent {
                transfer,
                transferred: progress.transferred,
                total: progress.total,
            },
        );
    })
    .await;

    let outcome = match result {
        Ok(destination) => Outcome::Succeeded {
            path: destination.display().to_string(),
        },
        Err(error) => Outcome::Failed {
            error: IpcError::from(error),
        },
    };
    let _ = app.emit(FINISHED_EVENT, FinishedEvent { transfer, outcome });

    app.state::<Transfers>().forget(transfer).await;
}

/// Starts an upload, and returns immediately with a handle for its progress
/// and outcome, which arrive as events.
#[tauri::command]
pub async fn sftp_upload<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    transfers: State<'_, Transfers>,
    handle: SessionHandle,
    local_path: String,
    remote_dir: String,
) -> Result<TransferHandle, IpcError> {
    let sftp = open_session(&registry, handle).await?;
    let local_path = PathBuf::from(local_path);
    let transfer = transfers.reserve();

    let task = tokio::spawn(run_upload(
        app.clone(),
        sftp,
        local_path,
        remote_dir,
        transfer,
    ));
    transfers.attach(transfer, task).await;

    Ok(transfer)
}

async fn run_upload<R: Runtime>(
    app: AppHandle<R>,
    sftp: SftpSession,
    local_path: PathBuf,
    remote_dir: String,
    transfer: TransferHandle,
) {
    let progress_app = app.clone();
    let result = session::upload(&sftp, &local_path, &remote_dir, move |progress| {
        let _ = progress_app.emit(
            PROGRESS_EVENT,
            ProgressEvent {
                transfer,
                transferred: progress.transferred,
                total: progress.total,
            },
        );
    })
    .await;

    let outcome = match result {
        Ok(remote_path) => Outcome::Succeeded { path: remote_path },
        Err(error) => Outcome::Failed {
            error: IpcError::from(error),
        },
    };
    let _ = app.emit(FINISHED_EVENT, FinishedEvent { transfer, outcome });

    app.state::<Transfers>().forget(transfer).await;
}

/// Starts a remote-to-remote transfer (ADR-0045), and returns immediately
/// with a handle for its progress and outcome, which arrive as events the
/// same way [`sftp_download`]'s and [`sftp_upload`]'s do.
///
/// `source_handle` and `dest_handle` are opened independently, in whichever
/// order they resolve; nothing here assumes or requires they name different
/// connections, since two sessions on the same connection cost nothing
/// extra to support and this command has no reason to refuse it.
#[tauri::command]
pub async fn sftp_transfer<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    transfers: State<'_, Transfers>,
    source_handle: SessionHandle,
    source_path: String,
    dest_handle: SessionHandle,
    dest_dir: String,
) -> Result<TransferHandle, IpcError> {
    let source = open_session(&registry, source_handle).await?;
    let destination = open_session(&registry, dest_handle).await?;
    let transfer = transfers.reserve();

    let task = tokio::spawn(run_transfer(
        app.clone(),
        source,
        source_path,
        destination,
        dest_dir,
        transfer,
    ));
    transfers.attach(transfer, task).await;

    Ok(transfer)
}

async fn run_transfer<R: Runtime>(
    app: AppHandle<R>,
    source: SftpSession,
    source_path: String,
    destination: SftpSession,
    dest_dir: String,
    transfer: TransferHandle,
) {
    let progress_app = app.clone();
    let result = session::transfer(
        &source,
        &source_path,
        &destination,
        &dest_dir,
        move |progress| {
            let _ = progress_app.emit(
                PROGRESS_EVENT,
                ProgressEvent {
                    transfer,
                    transferred: progress.transferred,
                    total: progress.total,
                },
            );
        },
    )
    .await;

    let outcome = match result {
        Ok(dest_path) => Outcome::Succeeded { path: dest_path },
        Err(error) => Outcome::Failed {
            error: IpcError::from(error),
        },
    };
    let _ = app.emit(FINISHED_EVENT, FinishedEvent { transfer, outcome });

    app.state::<Transfers>().forget(transfer).await;
}

/// Creates a directory named `name` inside `dir`, remotely. ADR-0048.
#[tauri::command]
pub async fn sftp_mkdir(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    dir: String,
    name: String,
) -> Result<String, IpcError> {
    let sftp = open_session(&registry, handle).await?;
    session::create_dir(&sftp, &dir, &name)
        .await
        .map_err(|error| Error::Sftp(Box::new(error)).into())
}

/// Renames `old_name` to `new_name`, within `dir`, remotely. ADR-0048.
#[tauri::command]
pub async fn sftp_rename(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    dir: String,
    old_name: String,
    new_name: String,
) -> Result<String, IpcError> {
    let sftp = open_session(&registry, handle).await?;
    session::rename(&sftp, &dir, &old_name, &new_name)
        .await
        .map_err(|error| Error::Sftp(Box::new(error)).into())
}

/// Removes `name` inside `dir`, remotely. A directory is removed
/// recursively. ADR-0048.
#[tauri::command]
pub async fn sftp_remove(
    registry: State<'_, Registry>,
    handle: SessionHandle,
    dir: String,
    name: String,
    is_dir: bool,
) -> Result<(), IpcError> {
    let sftp = open_session(&registry, handle).await?;
    session::remove(&sftp, &dir, &name, is_dir)
        .await
        .map_err(|error| Error::Sftp(Box::new(error)).into())
}

/// Creates a directory named `name` inside `dir`, locally. ADR-0048.
///
/// `spawn_blocking`, the same reason `local_list_directory` already needs
/// it: `std::fs::create_dir` is a blocking syscall, and running it inline
/// would stall every other command this process is mid-way through.
#[tauri::command]
pub async fn local_mkdir(dir: String, name: String) -> Result<String, IpcError> {
    tokio::task::spawn_blocking(move || {
        crate::sftp::local::create_dir(std::path::Path::new(&dir), &name)
    })
    .await
    .map_err(|_| Error::LocalFilesystem(crate::sftp::local::LocalError::Io))?
    .map(|path| path.display().to_string())
    .map_err(|error| Error::LocalFilesystem(error).into())
}

/// Renames `old_name` to `new_name`, within `dir`, locally. ADR-0048.
#[tauri::command]
pub async fn local_rename(
    dir: String,
    old_name: String,
    new_name: String,
) -> Result<String, IpcError> {
    tokio::task::spawn_blocking(move || {
        crate::sftp::local::rename(std::path::Path::new(&dir), &old_name, &new_name)
    })
    .await
    .map_err(|_| Error::LocalFilesystem(crate::sftp::local::LocalError::Io))?
    .map(|path| path.display().to_string())
    .map_err(|error| Error::LocalFilesystem(error).into())
}

/// Removes `name` inside `dir`, locally. A directory is removed
/// recursively. ADR-0048.
#[tauri::command]
pub async fn local_remove(dir: String, name: String, is_dir: bool) -> Result<(), IpcError> {
    tokio::task::spawn_blocking(move || {
        crate::sftp::local::remove(std::path::Path::new(&dir), &name, is_dir)
    })
    .await
    .map_err(|_| Error::LocalFilesystem(crate::sftp::local::LocalError::Io))?
    .map_err(|error| Error::LocalFilesystem(error).into())
}

/// Cancels a transfer in flight.
///
/// Never fails: a handle naming a transfer already finished, already
/// cancelled, or never issued all mean the same thing to a caller, that
/// transfer is not running, which is already true. `commands::terminal`'s
/// own `UnknownHandle` does not apply here, since a transfer, unlike a
/// session, has nothing left to be wrong about once it is gone.
#[tauri::command]
pub async fn sftp_cancel(
    transfers: State<'_, Transfers>,
    transfer: TransferHandle,
) -> Result<(), IpcError> {
    transfers.cancel(transfer).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_unknown_handle_is_refused_before_anything_opens() {
        /* `SessionHandle`'s field is private outside `ssh::registry`, so an
        arbitrary one for a test is built the way it actually crosses IPC:
        `#[serde(transparent)]` over a bare number (see
        `ssh::registry::tests::a_handle_crosses_as_a_bare_number`). */
        let phantom: SessionHandle = serde_json::from_str("999999").expect("deserializes");

        let registry = Registry::new();
        /* Not `.expect_err`: `SftpSession`, the `Ok` side, has no `Debug`,
        which `expect_err` needs to format a message if this were `Ok`. */
        match open_session(&registry, phantom).await {
            Err(Error::UnknownHandle) => {}
            other => panic!(
                "expected UnknownHandle, an SftpSession does not implement Debug to print {}",
                other.is_ok()
            ),
        }
    }
}
