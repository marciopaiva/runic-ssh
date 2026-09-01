//! An opt-in vault behind a master password, for a machine with no system
//! keychain to lean on.
//!
//! ADR-0035. Off by default; `Vault` (`super`) stays the primary path on
//! every platform that has one. This exists for the installations where
//! [`super::Vault::availability`] answers `Unavailable`, and it is protected
//! the same way the system keychain is expected to be: by something only the
//! user knows, not by anything this process could derive on its own. See the
//! ADR's Context section for why a keyless design was rejected outright.
//!
//! One file, `internal_vault.json`, whose presence *is* the setting: there is
//! no separate flag to drift out of step with whether the file exists.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use argon2::Argon2;
use base64ct::{Base64, Encoding};
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{ChaCha20Poly1305, Key, KeyInit, Nonce};
use zeroize::Zeroizing;

use crate::error::Error;

use super::{CredentialId, Secret};

const FILE_NAME: &str = "internal_vault.json";
/// What the verifier decrypts to, once the password is right. Never read for
/// its content, only for whether decrypting it succeeds at all.
const VERIFIER_PLAINTEXT: &[u8] = b"runic-ssh-internal-vault-v1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

/// One entry, as written to disk: a nonce and the ciphertext it opens.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct EncryptedEntry {
    nonce: String,
    ciphertext: String,
}

impl EncryptedEntry {
    fn seal(cipher: &ChaCha20Poly1305, plaintext: &[u8]) -> Result<Self, Error> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        getrandom::fill(&mut nonce_bytes).map_err(|_| Error::VaultUnwritable {
            reason: String::from("no randomness was available to seal this entry"),
        })?;
        let nonce = Nonce::from(nonce_bytes);

        let ciphertext = cipher
            .encrypt(&nonce, plaintext)
            .map_err(|_| Error::VaultUnwritable {
                reason: String::from("the entry could not be sealed"),
            })?;

        Ok(Self {
            nonce: Base64::encode_string(&nonce_bytes),
            ciphertext: Base64::encode_string(&ciphertext),
        })
    }

    fn open(&self, cipher: &ChaCha20Poly1305) -> Result<Zeroizing<Vec<u8>>, Error> {
        let nonce_bytes = Base64::decode_vec(&self.nonce).map_err(|_| Error::VaultUnreadable {
            reason: String::from("an entry's nonce is not valid base64"),
        })?;
        let nonce =
            Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| Error::VaultUnreadable {
                reason: String::from("an entry's nonce is the wrong length"),
            })?;
        let ciphertext =
            Base64::decode_vec(&self.ciphertext).map_err(|_| Error::VaultUnreadable {
                reason: String::from("an entry's ciphertext is not valid base64"),
            })?;

        let opened =
            cipher
                .decrypt(&nonce, ciphertext.as_ref())
                .map_err(|_| Error::VaultUnreadable {
                    reason: String::from("an entry did not decrypt under this key"),
                })?;

        Ok(Zeroizing::new(opened))
    }
}

/// The file's own shape. `serde_json`, matching every other config file in
/// the tree (`config::sessions`, `config::mod`) rather than a new format.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct VaultFile {
    salt: String,
    verifier: EncryptedEntry,
    #[serde(default)]
    entries: HashMap<String, EncryptedEntry>,
}

/// Whether this installation's internal vault is set up, and if so, whether
/// this session has unlocked it yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InternalVaultState {
    NotConfigured,
    Locked,
    Unlocked,
}

/// The opt-in vault. One per application, holding the derived key for
/// whichever session has unlocked it, exactly the way [`super::SessionSecrets`]
/// holds a run's own credentials: in memory, wiped on drop, never written
/// anywhere but the encrypted file itself.
///
/// `unlocked` sits behind its own `Arc` rather than the whole struct sitting
/// behind Tauri's, so a caller resolving a credential can clone this cheaply
/// and move the clone into `spawn_blocking`: reading the file and decrypting
/// an entry are both synchronous, and running them on the async runtime's own
/// thread is the mistake section 6 already names for the filesystem, applied
/// here to the same disk read this vault is. Cloning shares the one lock
/// rather than copying the key underneath it, so nothing about zeroizing it
/// on drop changes: the key is dropped, and wiped, exactly once, when the
/// last clone is.
#[derive(Clone)]
pub struct InternalVault {
    path: PathBuf,
    unlocked: Arc<Mutex<Option<Zeroizing<[u8; 32]>>>>,
}

impl InternalVault {
    pub fn new(directory: impl Into<PathBuf>) -> Self {
        Self {
            path: directory.into().join(FILE_NAME),
            unlocked: Arc::new(Mutex::new(None)),
        }
    }

    fn read_file(&self) -> Result<Option<VaultFile>, Error> {
        match fs::read_to_string(&self.path) {
            Ok(text) => serde_json::from_str(&text)
                .map(Some)
                .map_err(|_| Error::VaultUnreadable {
                    reason: String::from("the vault file is not valid JSON"),
                }),
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(source) => Err(Error::VaultUnreadable {
                reason: source.to_string(),
            }),
        }
    }

    /// Written to a temporary file and renamed into place, the same rule
    /// `config::SettingsStore::save` already follows: a crash midway leaves
    /// the previous file intact rather than a truncated one that fails to
    /// parse on the next read.
    fn write_file(&self, file: &VaultFile) -> Result<(), Error> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|source| Error::VaultUnwritable {
                reason: source.to_string(),
            })?;
        }

        let json = serde_json::to_string_pretty(file).map_err(|_| Error::VaultUnwritable {
            reason: String::from("the vault could not be serialized"),
        })?;

        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, json.as_bytes()).map_err(|source| Error::VaultUnwritable {
            reason: source.to_string(),
        })?;
        fs::rename(&temporary, &self.path).map_err(|source| Error::VaultUnwritable {
            reason: source.to_string(),
        })
    }

    pub fn status(&self) -> Result<InternalVaultState, Error> {
        if self.read_file()?.is_none() {
            return Ok(InternalVaultState::NotConfigured);
        }

        Ok(match self.key() {
            Some(_) => InternalVaultState::Unlocked,
            None => InternalVaultState::Locked,
        })
    }

    fn key(&self) -> Option<Zeroizing<[u8; 32]>> {
        self.unlocked.lock().ok()?.clone()
    }

    fn derive(password: &Secret, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, Error> {
        let mut key = Zeroizing::new([0u8; 32]);
        Argon2::default()
            .hash_password_into(password.expose().as_bytes(), salt, key.as_mut())
            .map_err(|_| Error::VaultUnwritable {
                reason: String::from("the password could not be processed"),
            })?;
        Ok(key)
    }

    fn cipher(key: &[u8; 32]) -> ChaCha20Poly1305 {
        ChaCha20Poly1305::new(&Key::from(*key))
    }

    /// Creates the vault, with `existing` already migrated in. `existing` is
    /// read by the caller (from [`super::Vault`]) rather than by this
    /// function: this module knows how to encrypt, not where a system
    /// keychain's credentials come from.
    pub fn enable(
        &self,
        password: &Secret,
        existing: &[(CredentialId, Secret)],
    ) -> Result<(), Error> {
        let mut salt = [0u8; SALT_LEN];
        getrandom::fill(&mut salt).map_err(|_| Error::VaultUnwritable {
            reason: String::from("no randomness was available to set up the vault"),
        })?;

        let key = Self::derive(password, &salt)?;
        let cipher = Self::cipher(&key);
        let verifier = EncryptedEntry::seal(&cipher, VERIFIER_PLAINTEXT)?;

        let mut entries = HashMap::with_capacity(existing.len());
        for (id, secret) in existing {
            let sealed = EncryptedEntry::seal(&cipher, secret.expose().as_bytes())?;
            entries.insert(id.as_str().to_owned(), sealed);
        }

        self.write_file(&VaultFile {
            salt: Base64::encode_string(&salt),
            verifier,
            entries,
        })?;

        if let Ok(mut unlocked) = self.unlocked.lock() {
            *unlocked = Some(key);
        }

        Ok(())
    }

    /// Derives the key from `password` and holds it for the rest of this
    /// session if the verifier opens under it.
    pub fn unlock(&self, password: &Secret) -> Result<(), Error> {
        let file = self.read_file()?.ok_or(Error::VaultNotConfigured)?;
        let salt = Base64::decode_vec(&file.salt).map_err(|_| Error::VaultUnreadable {
            reason: String::from("the vault's salt is not valid base64"),
        })?;

        let key = Self::derive(password, &salt)?;
        let cipher = Self::cipher(&key);

        if file.verifier.open(&cipher).is_err() {
            return Err(Error::VaultWrongPassword);
        }

        if let Ok(mut unlocked) = self.unlocked.lock() {
            *unlocked = Some(key);
        }

        Ok(())
    }

    fn unlocked_cipher(&self) -> Result<ChaCha20Poly1305, Error> {
        match self.key() {
            Some(key) => Ok(Self::cipher(&key)),
            None => Err(if self.read_file()?.is_some() {
                Error::VaultLocked
            } else {
                Error::VaultNotConfigured
            }),
        }
    }

    pub fn store(&self, id: &CredentialId, secret: &Secret) -> Result<(), Error> {
        let cipher = self.unlocked_cipher()?;
        let mut file = self.read_file()?.ok_or(Error::VaultNotConfigured)?;

        let sealed = EncryptedEntry::seal(&cipher, secret.expose().as_bytes())?;
        file.entries.insert(id.as_str().to_owned(), sealed);
        self.write_file(&file)
    }

    pub fn resolve(&self, id: &CredentialId) -> Result<Secret, Error> {
        let cipher = self.unlocked_cipher()?;
        let file = self.read_file()?.ok_or(Error::VaultNotConfigured)?;

        let entry = file
            .entries
            .get(id.as_str())
            .ok_or(Error::NoSavedCredential)?;
        let opened = entry.open(&cipher)?;
        let text = String::from_utf8(opened.to_vec()).map_err(|_| Error::VaultUnreadable {
            reason: String::from("a decrypted entry is not valid UTF-8"),
        })?;

        Ok(Secret::new(text))
    }

    /// Removes one entry. Not there in the first place is not an error, the
    /// same rule [`super::Vault::forget`] follows.
    pub fn forget(&self, id: &CredentialId) -> Result<(), Error> {
        let mut file = match self.read_file()? {
            Some(file) => file,
            None => return Ok(()),
        };

        if file.entries.remove(id.as_str()).is_none() {
            return Ok(());
        }

        self.write_file(&file)
    }

    /// Decrypts every entry under the key this session already holds, and
    /// returns them for the caller to write into the system keychain, then
    /// deletes the file. The caller owns the keychain write; this module
    /// only knows how to decrypt.
    ///
    /// No password: unlocking already proved it once, and a vault holding
    /// its key resolves any single entry the same way, without asking
    /// again. Requiring it a second time here protected nothing a session
    /// already unlocked did not already give away. `VaultLocked` from
    /// `unlocked_cipher` is what a caller gets instead, on the path the
    /// frontend no longer offers: reaching this while locked at all.
    pub fn disable(&self) -> Result<Vec<(CredentialId, Secret)>, Error> {
        let cipher = self.unlocked_cipher()?;
        let file = self.read_file()?.ok_or(Error::VaultNotConfigured)?;

        let mut migrated = Vec::with_capacity(file.entries.len());
        for (id, entry) in &file.entries {
            let opened = entry.open(&cipher)?;
            let text = String::from_utf8(opened.to_vec()).map_err(|_| Error::VaultUnreadable {
                reason: String::from("a decrypted entry is not valid UTF-8"),
            })?;
            migrated.push((CredentialId::from_stored(id.clone()), Secret::new(text)));
        }

        self.reset()?;
        Ok(migrated)
    }

    /// The "I forgot the password" exit and `disable`'s own last step alike:
    /// no password needed, because losing the file is the whole point of
    /// resetting one that cannot be recovered.
    pub fn reset(&self) -> Result<(), Error> {
        if let Ok(mut unlocked) = self.unlocked.lock() {
            *unlocked = None;
        }

        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(source) => Err(Error::VaultUnwritable {
                reason: source.to_string(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (InternalVault, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        (InternalVault::new(dir.path()), dir)
    }

    #[test]
    fn a_fresh_vault_is_not_configured() {
        let (vault, _dir) = vault();
        assert_eq!(vault.status().unwrap(), InternalVaultState::NotConfigured);
    }

    #[test]
    fn enabling_leaves_it_unlocked_for_this_session() {
        let (vault, _dir) = vault();
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();
        assert_eq!(vault.status().unwrap(), InternalVaultState::Unlocked);
    }

    #[test]
    fn a_second_handle_on_the_same_file_starts_locked() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = InternalVault::new(dir.path());
        first
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        let second = InternalVault::new(dir.path());
        assert_eq!(second.status().unwrap(), InternalVaultState::Locked);
    }

    #[test]
    fn the_right_password_unlocks_it() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = InternalVault::new(dir.path());
        first
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        let second = InternalVault::new(dir.path());
        second
            .unlock(&Secret::new("correct horse battery staple"))
            .unwrap();
        assert_eq!(second.status().unwrap(), InternalVaultState::Unlocked);
    }

    #[test]
    fn the_wrong_password_is_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = InternalVault::new(dir.path());
        first
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        let second = InternalVault::new(dir.path());
        let err = second
            .unlock(&Secret::new("wrong password entirely"))
            .unwrap_err();
        assert!(matches!(err, Error::VaultWrongPassword));
        assert_eq!(second.status().unwrap(), InternalVaultState::Locked);
    }

    #[test]
    fn store_and_resolve_round_trip() {
        let (vault, _dir) = vault();
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        let id = CredentialId::for_session("web-01");
        vault.store(&id, &Secret::new("hunter2")).unwrap();

        assert_eq!(vault.resolve(&id).unwrap().expose(), "hunter2");
    }

    #[test]
    fn a_locked_vault_refuses_store_and_resolve() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = InternalVault::new(dir.path());
        first
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();
        let id = CredentialId::for_session("web-01");
        first.store(&id, &Secret::new("hunter2")).unwrap();

        let second = InternalVault::new(dir.path());
        assert!(matches!(
            second.resolve(&id).unwrap_err(),
            Error::VaultLocked
        ));
        assert!(matches!(
            second.store(&id, &Secret::new("x")).unwrap_err(),
            Error::VaultLocked
        ));
    }

    #[test]
    fn forgetting_an_entry_that_is_not_there_is_not_an_error() {
        let (vault, _dir) = vault();
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();
        vault.forget(&CredentialId::for_session("nope")).unwrap();
    }

    #[test]
    fn forget_removes_only_the_named_entry() {
        let (vault, _dir) = vault();
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();
        let kept = CredentialId::for_session("kept");
        let gone = CredentialId::for_session("gone");
        vault.store(&kept, &Secret::new("a")).unwrap();
        vault.store(&gone, &Secret::new("b")).unwrap();

        vault.forget(&gone).unwrap();

        assert_eq!(vault.resolve(&kept).unwrap().expose(), "a");
        assert!(matches!(
            vault.resolve(&gone).unwrap_err(),
            Error::NoSavedCredential
        ));
    }

    #[test]
    fn enable_migrates_what_it_is_handed() {
        let (vault, _dir) = vault();
        let id = CredentialId::for_session("web-01");
        vault
            .enable(
                &Secret::new("correct horse battery staple"),
                &[(id.clone(), Secret::new("hunter2"))],
            )
            .unwrap();

        assert_eq!(vault.resolve(&id).unwrap().expose(), "hunter2");
    }

    #[test]
    fn disable_returns_every_entry_decrypted_and_removes_the_file() {
        let (vault, dir) = vault();
        let id = CredentialId::for_session("web-01");
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();
        vault.store(&id, &Secret::new("hunter2")).unwrap();

        let migrated = vault.disable().unwrap();

        assert_eq!(migrated.len(), 1);
        assert_eq!(migrated[0].0.as_str(), id.as_str());
        assert_eq!(migrated[0].1.expose(), "hunter2");
        assert_eq!(vault.status().unwrap(), InternalVaultState::NotConfigured);
        assert!(!dir.path().join(FILE_NAME).exists());
    }

    #[test]
    fn disable_while_locked_leaves_the_vault_untouched() {
        /* Two handles, the same way `the_wrong_password_is_refused` needs
        them: `enable` on the same instance would leave it unlocked already,
        which would make a `disable` that never checked anything look like
        it worked for the wrong reason. */
        let dir = tempfile::tempdir().expect("tempdir");
        let first = InternalVault::new(dir.path());
        first
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        let second = InternalVault::new(dir.path());
        let err = second.disable().unwrap_err();

        assert!(matches!(err, Error::VaultLocked));
        assert_eq!(second.status().unwrap(), InternalVaultState::Locked);
    }

    #[test]
    fn reset_needs_no_password_and_clears_the_file() {
        let (vault, dir) = vault();
        vault
            .enable(&Secret::new("correct horse battery staple"), &[])
            .unwrap();

        vault.reset().unwrap();

        assert_eq!(vault.status().unwrap(), InternalVaultState::NotConfigured);
        assert!(!dir.path().join(FILE_NAME).exists());
    }

    #[test]
    fn resetting_an_unconfigured_vault_is_not_an_error() {
        let (vault, _dir) = vault();
        vault.reset().unwrap();
    }
}
