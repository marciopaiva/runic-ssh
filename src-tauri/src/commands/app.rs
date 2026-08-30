//! Build identity.

/// The version this process was built with.
///
/// Read from `CARGO_PKG_VERSION` at compile time, the same field
/// `tauri.conf.json` and `package.json` carry (CLAUDE.md section 10), rather
/// than anything read at runtime: this is what is actually running, not what
/// a source file claims.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_version_answered_is_the_one_this_binary_was_built_with() {
        assert_eq!(app_version(), env!("CARGO_PKG_VERSION"));
    }
}
