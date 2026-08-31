//! Turning a name the remote server chose into a path we choose to trust.
//!
//! `docs/security-model.md`: "SFTP filenames are treated as hostile: no path
//! traversal on download, no control characters rendered raw in the file
//! list, length capped." This module is the one place that rule is code
//! rather than a sentence. `#127` names five shapes an attacker gets for
//! free just by naming a directory entry: `../../../../etc/passwd`,
//! `/foo/../bar` after normalisation, a symlink pointing outside the
//! directory being browsed, an absolute path where a relative one was
//! expected, and control characters or terminal escapes reaching a renderer.
//! Everything below answers one of those.
//!
//! What this module does not do: follow a symlink to decide whether *it*
//! escapes. A listing entry that is a symlink is flagged by `sftp::session`,
//! which has the metadata to know; this module only ever sees a name and a
//! directory it is not allowed to leave.

use std::path::{Path, PathBuf};

/// The length past which a name is refused outright rather than displayed.
///
/// Matches `docs/security-model.md`'s "length capped" for listings: a name
/// this long is not a filename a person chose, and holding it in memory or
/// laying it out in the file list is work an attacker gets to demand for
/// free by naming one directory entry.
pub const MAX_NAME_LEN: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("the name is empty")]
    Empty,
    #[error("the name is too long")]
    TooLong,
    #[error("the name is a path rather than a single entry")]
    NotASingleSegment,
    #[error("the name refers to the current or parent directory")]
    DotEntry,
    #[error("the name contains a control character")]
    ControlCharacter,
}

/// Checks a single remote directory entry's name for anything this
/// application is not willing to hold, display or write to disk under.
///
/// Every caller that receives a name from the server, a listing row, a
/// download's source, an upload's reported result, runs it through this
/// before doing anything else with it. Cheap and total: it never inspects the
/// filesystem, so it cannot itself be fooled by one.
pub fn check_name(name: &str) -> Result<(), PathError> {
    if name.is_empty() {
        return Err(PathError::Empty);
    }
    if name.len() > MAX_NAME_LEN {
        return Err(PathError::TooLong);
    }
    if name == "." || name == ".." {
        return Err(PathError::DotEntry);
    }
    /* A legitimate directory entry's name never contains a path separator:
    that is what makes it one entry rather than a path. `/` and `\` are
    refused on every platform this ships on, not only the one that treats
    the latter as a separator, because a name is data a Windows build reads
    from a Linux server and the reverse just as often. `:` goes with them:
    an NTFS alternate data stream (`name:stream`) and a Windows drive-relative
    reference (`C:name`) both hide a second meaning behind a character that
    is otherwise unremarkable in a filename. */
    if name.contains(['/', '\\', ':']) {
        return Err(PathError::NotASingleSegment);
    }
    if name.chars().any(|c| c.is_control()) {
        return Err(PathError::ControlCharacter);
    }

    Ok(())
}

/// Resolves a checked entry name to a path strictly inside `base`.
///
/// `name` is one directory entry, never a path a caller assembled from
/// several: `check_name` having passed is what this relies on, since a name
/// with no separator, no `.`/`..`, and no control character can only ever
/// resolve to a direct child of `base` once joined. This function does not
/// call `check_name` itself so that a caller which already checked a batch of
/// listing entries is not made to pay for a second pass; every caller must
/// have called it first regardless.
pub fn resolve(base: &Path, name: &str) -> PathBuf {
    base.join(name)
}

/// Checks the name and resolves it in one call, for the common case of a
/// single download or upload rather than a batch already checked as a list.
pub fn safe_destination(base: &Path, name: &str) -> Result<PathBuf, PathError> {
    check_name(name)?;
    Ok(resolve(base, name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::{RngExt, SeedableRng};

    #[test]
    fn an_ordinary_name_resolves_under_the_base() {
        let base = Path::new("/home/user/downloads");
        assert_eq!(
            safe_destination(base, "report.pdf").expect("an ordinary name"),
            Path::new("/home/user/downloads/report.pdf")
        );
    }

    #[test]
    fn parent_directory_traversal_is_refused() {
        for hostile in ["..", "../etc/passwd", "../../../../etc/passwd"] {
            assert!(
                check_name(hostile).is_err(),
                "{hostile:?} should have been refused"
            );
        }
    }

    #[test]
    fn an_absolute_path_is_refused() {
        for hostile in ["/etc/passwd", "/foo/../bar", "\\\\server\\share"] {
            assert!(
                check_name(hostile).is_err(),
                "{hostile:?} should have been refused"
            );
        }
    }

    #[test]
    fn a_windows_drive_or_stream_reference_is_refused() {
        for hostile in ["C:", "C:evil.exe", "report.pdf:hidden-stream"] {
            assert!(
                check_name(hostile).is_err(),
                "{hostile:?} should have been refused"
            );
        }
    }

    #[test]
    fn the_current_directory_entry_is_refused() {
        assert_eq!(check_name("."), Err(PathError::DotEntry));
    }

    #[test]
    fn control_characters_are_refused() {
        for hostile in ["report\u{1b}[31m.pdf", "a\0b", "a\nb", "a\tb"] {
            assert_eq!(
                check_name(hostile),
                Err(PathError::ControlCharacter),
                "{hostile:?} should have been refused"
            );
        }
    }

    #[test]
    fn empty_and_oversized_names_are_refused() {
        assert_eq!(check_name(""), Err(PathError::Empty));
        assert_eq!(
            check_name(&"a".repeat(MAX_NAME_LEN + 1)),
            Err(PathError::TooLong)
        );
        /* Exactly the limit is still a name a real filesystem could hold. */
        assert!(check_name(&"a".repeat(MAX_NAME_LEN)).is_ok());
    }

    #[test]
    fn an_ordinary_unicode_name_is_accepted() {
        for fine in ["café.txt", "日本語.txt", "résumé (final).docx"] {
            assert!(check_name(fine).is_ok(), "{fine:?} should be accepted");
        }
    }

    /// One random name, drawn so that a large share of iterations land on the
    /// exact hostile shapes `#127` names rather than only ever on the wide,
    /// mostly-harmless space plain random bytes would spend nearly all its
    /// time in.
    fn random_name(rng: &mut StdRng) -> String {
        const HOSTILE: &[&str] = &[
            "..",
            "../etc/passwd",
            "../../../../etc/passwd",
            "/etc/passwd",
            "/foo/../bar",
            ".",
            "",
            "C:evil.exe",
            "name:stream",
            "a/b",
            "a\\b",
        ];
        const CONTROL: &[char] = &['\u{0}', '\u{1b}', '\n', '\t', '\u{7f}', '\u{9f}'];
        const PLAIN: &[u8] =
            b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-_()";

        match rng.random_range(0..4) {
            0 => HOSTILE[rng.random_range(0..HOSTILE.len())].to_owned(),
            1 => {
                /* A plain name with one control character spliced in
                somewhere, rather than only ever at the start. */
                let len = rng.random_range(1..20);
                let mut s: String = (0..len)
                    .map(|_| PLAIN[rng.random_range(0..PLAIN.len())] as char)
                    .collect();
                let at = rng.random_range(0..=s.chars().count());
                let byte_at = s.char_indices().nth(at).map_or(s.len(), |(index, _)| index);
                s.insert(byte_at, CONTROL[rng.random_range(0..CONTROL.len())]);
                s
            }
            2 => {
                let len = rng.random_range(0..40);
                (0..len)
                    .map(|_| PLAIN[rng.random_range(0..PLAIN.len())] as char)
                    .collect()
            }
            _ => {
                let len = rng.random_range(0..MAX_NAME_LEN + 5);
                (0..len)
                    .map(|_| PLAIN[rng.random_range(0..PLAIN.len())] as char)
                    .collect()
            }
        }
    }

    #[test]
    fn generated_names_never_escape_the_base_when_accepted() {
        /* Seeded rather than truly random, for the same reason known_hosts's
        own generated test is: a failure is reproducible from the seed
        printed in the assertion rather than a report nobody can rebuild. */
        let mut rng = StdRng::seed_from_u64(0x7366747073617465);
        let base = Path::new("/home/user/downloads");

        for iteration in 0..2000 {
            let name = random_name(&mut rng);

            match safe_destination(base, &name) {
                Err(_) => { /* Refusing is always a safe answer; nothing to check. */ }
                Ok(resolved) => {
                    assert!(
                        resolved.starts_with(base),
                        "iteration {iteration}: {name:?} resolved to {resolved:?}, \
                         outside {base:?}"
                    );
                    assert_ne!(
                        resolved, base,
                        "iteration {iteration}: {name:?} resolved to the base \
                         itself rather than a child of it"
                    );
                    assert_eq!(
                        resolved.parent(),
                        Some(base),
                        "iteration {iteration}: {name:?} resolved to \
                         {resolved:?}, which is not a direct child of {base:?}"
                    );
                    assert!(
                        !name.chars().any(char::is_control),
                        "iteration {iteration}: {name:?} was accepted with a \
                         control character in it"
                    );
                }
            }
        }
    }
}
