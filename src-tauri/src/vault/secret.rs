//! The one type a secret is allowed to be.
//!
//! ADR-0026. Rule 2 says nothing secret is ever logged, and until this type
//! existed that rule was held by three hand-written `Debug` implementations and
//! by everyone remembering to write the fourth. One of the three was written
//! after `main` had already been rendering `Password { secret: "hunter2" }`.
//!
//! What this type refuses is the decision, and it is worth reading as a list of
//! things that do not compile:
//!
//! * `format!("{secret}")`, because there is no `Display`;
//! * `#[derive(Serialize)]` on any struct that gains a secret field, because
//!   there is no `Serialize`;
//! * `secret.len()`, `secret.contains(..)` and every other `str` method reached
//!   by accident, because there is no `Deref`.
//!
//! [`Secret::expose`] is the single door, and it is named so that the audit is
//! `grep -rn expose src/`.

use zeroize::Zeroizing;

/// Secret material: a password, a passphrase, a private key, or the encoded
/// form of one of those on its way to the keychain.
///
/// The contents are wiped when this is dropped, which is rule 4. That is a
/// memory guarantee and not a formatting one, which is the confusion this type
/// exists to end: `Zeroizing<String>` renders its contents through both `Debug`
/// and, by way of `Deref`, `Display`.
#[derive(Clone)]
pub struct Secret(Zeroizing<String>);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(Zeroizing::new(value.into()))
    }

    /// Hands out the material.
    ///
    /// Deliberately a method with a name somebody has to type. It is the only
    /// way out of this type, so a reviewer asking "where can this leak" has one
    /// search to run rather than a language to reason about.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    /// Prints nothing of itself, and nothing about itself either.
    ///
    /// Not even the length: a four character password and a 3000 character
    /// private key are different facts about a person's security, and a log
    /// that carries the first has narrowed the search for whoever reads it.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("<redacted>")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl From<Zeroizing<String>> for Secret {
    fn from(value: Zeroizing<String>) -> Self {
        Self(value)
    }
}

/// Deliberately asymmetric with `Serialize`, which this type does not
/// implement.
///
/// They are not opposites here. Deserializing is a secret entering the process
/// from the person who typed it, which is how one legitimately arrives;
/// serializing is a secret leaving. Refusing the first would only mean the
/// plaintext lives as a bare `String` for a line and a half longer, on its way
/// from the prompt window to here.
///
/// `String::deserialize` builds an ordinary `String` before this wraps it. That
/// intermediate is not wiped, and avoiding it means writing a deserializer
/// rather than using one. ADR-0026 accepts it, in the same paragraph as the
/// matching intermediate in `StoredCredential::encode`.
impl<'de> serde::Deserialize<'de> for Secret {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value: String = serde::Deserialize::deserialize(deserializer)?;
        Ok(Self::new(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_prints_nothing_of_itself() {
        let secret = Secret::new("hunter2");

        for rendered in [format!("{secret:?}"), format!("{secret:#?}")] {
            assert_eq!(rendered, "<redacted>");
        }
    }

    #[test]
    fn it_prints_nothing_from_inside_a_derive() {
        /* The point of the whole type. A struct that derives `Debug` and gains
        a secret field is safe by construction, which is what replaces three
        hand-written implementations. */
        /* Read only by the derive, which `dead_code` does not count. */
        #[derive(Debug)]
        #[allow(dead_code)]
        struct Holder {
            user: &'static str,
            password: Secret,
        }

        let rendered = format!(
            "{:?}",
            Holder {
                user: "deploy",
                password: Secret::new("hunter2"),
            }
        );

        assert!(rendered.contains("deploy"));
        assert!(!rendered.contains("hunter2"));
    }

    #[test]
    fn it_arrives_from_the_wire_as_a_bare_string() {
        /* The prompt window sends a JSON string and nothing else. If this ever
        needs a wrapper object, every caller in `src/commands/` changes with
        it. */
        let secret: Secret = serde_json::from_str(r#""hunter2""#).expect("deserializes");
        assert_eq!(secret.expose(), "hunter2");
    }

    #[test]
    fn the_door_is_the_only_way_out() {
        assert_eq!(Secret::new("hunter2").expose(), "hunter2");
    }
}
