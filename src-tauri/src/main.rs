#![forbid(unsafe_code)]
// A release build must not open a console window behind the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Startup happens before any credential is read, so printing the cause here
    // cannot leak one. Nothing further along may follow this pattern.
    if let Err(error) = runic_ssh::run() {
        eprintln!("Runic SSH failed to start: {error}");
        std::process::exit(1);
    }
}
