//! Directory listing and file transfer, over an SFTP subsystem channel opened
//! fresh on the connection that already exists.
//!
//! One channel per call rather than one held open across a browsing session:
//! `Connection::open_sftp` costs a handful of round trips, not a new
//! authentication, and starting simple here means there is no session state
//! to keep in step with a shell or another transfer running on the same
//! handle. Reusing one across several calls is a reasonable thing to want
//! later, and nothing about the shape below forecloses it.

use std::path::Path;

use russh_sftp::client::SftpSession as RawSftpSession;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::sftp::error::SftpError;
use crate::sftp::path::{check_name, safe_destination};
use crate::ssh::connection::Connection;

/// How much of a transfer has moved, for a progress event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progress {
    pub transferred: u64,
    /// `None` when the server did not report a size, which SFTP never
    /// requires it to. A progress bar with no total still has a number to
    /// show; it just cannot be a fraction.
    pub total: Option<u64>,
}

/// One directory entry, filtered and typed for a caller that does not know
/// the SFTP protocol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// The entry's own name. Already passed `check_name`: this is never a
    /// path, never `.` or `..`, never carrying a separator or a control
    /// character.
    pub name: String,
    /// The full remote path, built by the server side of `read_dir` joining
    /// the listed directory with `name`. Never assembled by string
    /// concatenation on this side.
    pub remote_path: String,
    pub is_dir: bool,
    /// A symlink is shown as one, not followed. Its target may point outside
    /// the directory being browsed, and nothing here resolves it: `#127`'s
    /// own risk list names exactly this.
    pub is_symlink: bool,
    pub size: u64,
    pub modified_unix_secs: Option<i64>,
}

/// Opens a fresh SFTP subsystem channel and speaks the protocol over it.
async fn open(connection: &Connection) -> Result<RawSftpSession, SftpError> {
    let channel = connection.open_sftp().await?;
    let session = RawSftpSession::new(channel.into_stream()).await?;
    Ok(session)
}

/// Lists a remote directory.
///
/// An entry whose name fails `check_name` is dropped from the result rather
/// than shown mangled or half-escaped: the same instinct
/// `known_hosts::parse` follows for a line it cannot read, applied to a
/// directory entry it cannot trust. This is also what keeps `.` and `..`,
/// which a real SFTP server includes, out of the result without a special
/// case for either.
pub async fn list(connection: &Connection, path: &str) -> Result<Vec<Entry>, SftpError> {
    let sftp = open(connection).await?;
    let listing = sftp.read_dir(path).await?;

    let mut entries = Vec::new();
    for item in listing {
        let name = item.file_name();
        if check_name(&name).is_err() {
            continue;
        }

        let metadata = item.metadata();
        entries.push(Entry {
            remote_path: item.path(),
            name,
            is_dir: metadata.is_dir(),
            is_symlink: metadata.is_symlink(),
            size: metadata.len(),
            modified_unix_secs: metadata.modified().ok().and_then(|time| {
                time.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|elapsed| elapsed.as_secs() as i64)
            }),
        });
    }

    Ok(entries)
}

const CHUNK: usize = 32 * 1024;

/// Downloads `remote_path` into `local_dir`, under the name its own last
/// path segment checks out to.
///
/// The local name comes from `remote_path` itself, not from a second
/// parameter a caller could send out of step with it: whatever a listing
/// call already validated as `Entry::remote_path` is the only path a caller
/// has to build this from, and its last segment is the same name
/// `check_name` already passed for that entry to appear in a listing at all.
/// A caller that assembles a path some other way still gets the same check,
/// paid for here rather than trusted to have been paid elsewhere.
///
/// Cancellation is not this function's to implement: it is meant to run
/// inside a task a caller holds the `JoinHandle` for, and `.abort()` on that
/// handle stops it at the next await point, which a chunked read/write loop
/// hits every `CHUNK` bytes. Adding a token here would duplicate a
/// cancellation story Tokio already gives the caller for free.
pub async fn download(
    connection: &Connection,
    remote_path: &str,
    local_dir: &Path,
    mut on_progress: impl FnMut(Progress) + Send,
) -> Result<std::path::PathBuf, SftpError> {
    let name = last_segment(remote_path);
    let destination = safe_destination(local_dir, name)?;

    let sftp = open(connection).await?;
    let total = sftp.metadata(remote_path).await.ok().map(|m| m.len());
    let mut remote_file = sftp.open(remote_path).await?;

    let mut local_file = tokio::fs::File::create(&destination)
        .await
        .map_err(|_| SftpError::LocalIo)?;

    let mut buffer = vec![0_u8; CHUNK];
    let mut transferred = 0_u64;

    loop {
        let n = remote_file.read(&mut buffer).await?;
        if n == 0 {
            break;
        }

        local_file
            .write_all(&buffer[..n])
            .await
            .map_err(|_| SftpError::LocalIo)?;
        transferred += n as u64;
        on_progress(Progress { transferred, total });
    }

    local_file.flush().await.map_err(|_| SftpError::LocalIo)?;
    Ok(destination)
}

/// Uploads `local_path` to `remote_dir`, joined with its own file name.
///
/// The file name comes from the local path the native picker returned
/// (ADR-0042), which this process chose and already trusts; `check_name`
/// still runs on it before it is sent, because the remote name a local pick
/// produces is still the name this application will ask a server to create,
/// and a name good enough for this machine's filesystem is not automatically
/// one every SFTP server accepts (a leading `.` meaning something different
/// remotely, for one).
///
/// Cancellation, as for [`download`], belongs to whichever task the caller
/// runs this in and its own `JoinHandle`, not to a token threaded through
/// here.
pub async fn upload(
    connection: &Connection,
    local_path: &Path,
    remote_dir: &str,
    mut on_progress: impl FnMut(Progress) + Send,
) -> Result<String, SftpError> {
    let name = local_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(SftpError::LocalIo)?;
    check_name(name)?;

    let remote_path = format!("{}/{name}", remote_dir.trim_end_matches('/'));

    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|_| SftpError::LocalIo)?;
    let total = local_file.metadata().await.ok().map(|m| m.len());

    let sftp = open(connection).await?;
    let mut remote_file = sftp.create(&remote_path).await?;

    let mut buffer = vec![0_u8; CHUNK];
    let mut transferred = 0_u64;

    loop {
        let n = local_file
            .read(&mut buffer)
            .await
            .map_err(|_| SftpError::LocalIo)?;
        if n == 0 {
            break;
        }

        remote_file.write_all(&buffer[..n]).await?;
        transferred += n as u64;
        on_progress(Progress { transferred, total });
    }

    remote_file.flush().await?;
    Ok(remote_path)
}

/// The last `/`-separated segment of a POSIX-style remote path.
///
/// SFTP paths are always POSIX-style on the wire regardless of either end's
/// own platform, which is what makes splitting on `/` correct here even on
/// a Windows build.
fn last_segment(remote_path: &str) -> &str {
    remote_path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(remote_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_last_segment_is_the_entry_name() {
        assert_eq!(last_segment("/home/deploy/logs/big.log"), "big.log");
        assert_eq!(last_segment("big.log"), "big.log");
        assert_eq!(last_segment("/home/deploy/logs/"), "logs");
    }
}
