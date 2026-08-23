//! Guards the bundle identity.
//!
//! The identifier is not a label. It decides where `app_config_dir` puts the
//! session file and `known_hosts`, and it names the keychain service the vault
//! stores credentials under. Changing it moves a user's saved hosts and hides
//! their saved secrets, with no error and nothing on screen to explain it.
//!
//! So it is pinned, and the two places it appears are checked against each
//! other.

fn config() -> serde_json::Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json");
    let text = std::fs::read_to_string(path).expect("tauri.conf.json is missing");
    serde_json::from_str(&text).expect("tauri.conf.json is not valid JSON")
}

fn identifier() -> String {
    config()["identifier"]
        .as_str()
        .expect("the bundle has no identifier")
        .to_owned()
}

#[test]
fn the_identifier_does_not_end_in_dot_app() {
    /* macOS names an application bundle `Something.app`, so an identifier
    ending the same way reads as a path rather than a name — Tauri warns about
    it, and the warning is easy to lose in a build log. */
    let identifier = identifier();

    assert!(
        !identifier.ends_with(".app"),
        "{identifier} collides with the macOS application bundle extension"
    );
}

#[test]
fn the_identifier_is_reverse_dns() {
    let identifier = identifier();
    let parts: Vec<_> = identifier.split('.').collect();

    assert!(
        parts.len() >= 3,
        "{identifier} is not a reverse-DNS name, and both macOS and the \
         keychain expect one"
    );
    assert!(
        parts.iter().all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        }),
        "{identifier} has a segment that is empty or not alphanumeric"
    );
}

#[test]
fn the_keychain_service_is_the_bundle_identifier() {
    /* Two copies of one name. They are self-consistent if they drift — the
    vault would store and read under the same wrong name — which is exactly
    what makes the drift silent: the symptom is a user's saved credentials
    disappearing at the version that introduced it. */
    assert_eq!(
        runic_ssh::vault::SERVICE,
        identifier(),
        "vault::SERVICE and the bundle identifier have drifted apart"
    );
}

#[test]
fn the_bundle_still_ships_the_icons_windows_needs_to_build() {
    /* On Windows the icon is a *build input*, not a packaging detail: the
    resource is compiled into the executable. A missing .ico fails the build on
    one platform only, which is the kind of thing that is discovered by CI
    rather than by review. */
    for icon in config()["bundle"]["icon"]
        .as_array()
        .expect("the bundle lists no icons")
    {
        let relative = icon.as_str().expect("an icon path is not a string");
        let path = format!("{}/{relative}", env!("CARGO_MANIFEST_DIR"));

        assert!(
            std::path::Path::new(&path).exists(),
            "{relative} is listed in tauri.conf.json and is not in the tree"
        );
    }
}

#[test]
fn the_version_is_the_same_in_all_three_places() {
    /* `package.json`, `Cargo.toml` and `tauri.conf.json` each carry a version,
    and only the last one names the installer. They drift silently: nothing
    reads two of them together, so a bumped `Cargo.toml` and a forgotten
    `tauri.conf.json` produce a build that calls itself the old version, in the
    filename a user downloads and in the entry `apt` and Windows record. */
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));

    let cargo =
        std::fs::read_to_string(manifest.join("Cargo.toml")).expect("Cargo.toml is missing");
    let cargo_version = cargo
        .lines()
        .find_map(|line| line.strip_prefix("version = "))
        .expect("Cargo.toml has no version")
        .trim()
        .trim_matches('"');

    let package =
        std::fs::read_to_string(manifest.join("../package.json")).expect("package.json is missing");
    let package: serde_json::Value =
        serde_json::from_str(&package).expect("package.json is not valid JSON");
    let package_version = package["version"]
        .as_str()
        .expect("package.json has no version");

    let config = config();
    let bundle_version = config["version"]
        .as_str()
        .expect("tauri.conf.json has no version");

    assert_eq!(
        cargo_version, bundle_version,
        "Cargo.toml and tauri.conf.json disagree about the version; the second \
         one is what the installer is named after"
    );
    assert_eq!(
        package_version, bundle_version,
        "package.json and tauri.conf.json disagree about the version"
    );
}
