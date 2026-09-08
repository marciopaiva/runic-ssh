//! A shape more than one command's own output shares: text a shell printed,
//! read as a list of lines rather than a single blob.

/// Every non-empty line of `stdout`, in the order the host printed them,
/// each one trimmed of trailing whitespace. Never fails: a host with
/// nothing to report yields an empty list rather than an error.
///
/// Shared rather than repeated once a third caller wanted it
/// ([`crate::ssh::journal::parse`], [`crate::ssh::tail::parse`] and
/// [`crate::ssh::candidate_logs::parse`]): each of the three commands this
/// backs is read-only and asks for the whole of a different kind of file,
/// but all three want the same "one line is one item, blank lines are
/// noise" answer.
#[must_use]
pub fn non_empty_lines(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn well_formed_output_becomes_trimmed_non_empty_lines_in_order() {
        let stdout = b"first  \n\nsecond\n";
        assert_eq!(
            non_empty_lines(stdout),
            vec!["first".to_owned(), "second".to_owned()]
        );
    }

    #[test]
    fn empty_output_yields_an_empty_list() {
        assert_eq!(non_empty_lines(b""), Vec::<String>::new());
    }
}
