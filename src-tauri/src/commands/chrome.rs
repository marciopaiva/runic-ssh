//! What the window chrome looks like on this platform.
//!
//! ADR-0005 decided that Windows and Linux run undecorated with controls we
//! draw, and macOS keeps its native traffic lights over an overlay titlebar.
//! That decision is answered here rather than in the webview, for two reasons.
//!
//! The frontend never learns which operating system it is running on. It asks
//! what the chrome looks like and is told; a component that branched on
//! `platform === 'macos'` would spread the decision across every file that
//! needed a pixel of it, and each copy would drift on its own.
//!
//! And `cfg!` is the only honest source for this. A value derived in the
//! webview from a user agent string describes the browser engine, not the
//! window the engine is painting into.

use serde::Serialize;

/// Who draws the minimise, maximise and close buttons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Controls {
    /// The platform draws them over our content. We draw none, and keep clear
    /// of them.
    System,
    /// We draw them, because the window has no decorations and nothing else
    /// will.
    Application,
}

/// The shape of the title area on this platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    pub controls: Controls,
    /// Pixels to keep clear at the leading edge, for controls we do not draw.
    pub leading_inset: u16,
}

/// The width the macOS traffic lights occupy, plus their inset.
///
/// Apple places three 12pt buttons on 20pt centres starting 20pt from the
/// leading edge, which ends at 72. The extra six is the gap that keeps a tab
/// from looking welded to the close button. It is a number that tracks Apple's
/// placement rather than a token, which ADR-0005 named as a cost of Option C.
const MACOS_TRAFFIC_LIGHTS: u16 = 78;

/// Describes the chrome for a platform, named rather than detected.
///
/// The platform is a parameter so both answers can be asserted from any host.
/// A `cfg!` inside the body would leave the branch this machine is not on
/// untested — and ADR-0005 named an under-tested cosmetic surface as the cost
/// it was accepting, which makes "untestable off macOS" the wrong shape here.
#[must_use]
pub fn chrome_for(system_draws_controls: bool) -> WindowChrome {
    if system_draws_controls {
        WindowChrome {
            controls: Controls::System,
            leading_inset: MACOS_TRAFFIC_LIGHTS,
        }
    } else {
        WindowChrome {
            controls: Controls::Application,
            leading_inset: 0,
        }
    }
}

/// Describes the chrome for the platform this build targets.
///
/// Split from the command so the shape can be asserted without an app handle.
#[must_use]
pub fn chrome() -> WindowChrome {
    chrome_for(cfg!(target_os = "macos"))
}

/// Tells the webview how to lay out the title area.
#[tauri::command]
#[must_use]
pub fn window_chrome() -> WindowChrome {
    chrome()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wire_form_is_the_one_the_frontend_declares() {
        /* Pinned on both sides. `CredentialStoreStatus` shipped with the two
        halves disagreeing because nothing compared them; the matching
        literals are in tests/ipc-contract.test.ts. */
        let system = serde_json::to_string(&WindowChrome {
            controls: Controls::System,
            leading_inset: 78,
        })
        .expect("serializes");
        let application = serde_json::to_string(&WindowChrome {
            controls: Controls::Application,
            leading_inset: 0,
        })
        .expect("serializes");

        assert_eq!(system, r#"{"controls":"system","leadingInset":78}"#);
        assert_eq!(
            application,
            r#"{"controls":"application","leadingInset":0}"#
        );
    }

    #[test]
    fn macos_keeps_its_traffic_lights_and_we_keep_clear_of_them() {
        let macos = chrome_for(true);

        assert_eq!(macos.controls, Controls::System);
        assert!(
            macos.leading_inset > 0,
            "the tab strip would be drawn under the traffic lights"
        );
    }

    #[test]
    fn an_undecorated_window_gets_controls_of_its_own() {
        assert_eq!(chrome_for(false).controls, Controls::Application);
    }

    #[test]
    fn space_is_only_reserved_for_controls_somebody_else_draws() {
        /* An inset with application-drawn controls is a strip of dead pixels
        at the leading edge that nothing ever fills. */
        for system_draws in [true, false] {
            let chrome = chrome_for(system_draws);

            if chrome.controls == Controls::Application {
                assert_eq!(chrome.leading_inset, 0);
            }
        }
    }

    #[test]
    fn this_build_answers_for_the_platform_it_targets() {
        /* The only assertion that has to run per-platform: that `chrome()`
        asks the question the right way round. */
        assert_eq!(chrome(), chrome_for(cfg!(target_os = "macos")));
    }
}
