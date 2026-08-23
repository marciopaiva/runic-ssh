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
use tauri::{Runtime, WebviewWindow};

use crate::error::{Error, IpcError};

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

/// The modifier a platform expects on an application shortcut.
///
/// Here rather than in a keyboard module because it is the same question this
/// file already answers — what does this platform expect of us — and the
/// alternative is a second command asking `cfg!(target_os = "macos")` again.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CommandModifier {
    /// Command, on macOS.
    Meta,
    /// Control, everywhere else.
    Control,
}

/// What this platform expects of us: the title area, and the primary modifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    pub controls: Controls,
    /// Pixels to keep clear at the leading edge, for controls we do not draw.
    pub leading_inset: u16,
    pub command_modifier: CommandModifier,
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
            command_modifier: CommandModifier::Meta,
        }
    } else {
        WindowChrome {
            controls: Controls::Application,
            leading_inset: 0,
            command_modifier: CommandModifier::Control,
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

/// What a control we drew is asking the window to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowRequest {
    Minimize,
    ToggleMaximize,
    Close,
}

/// Acts on the window on behalf of a control we drew.
///
/// Through the core rather than through `@tauri-apps/api/window`, for two
/// reasons that turned out to be the same reason.
///
/// The capability gets narrower: minimising, maximising and closing no longer
/// need a permanent grant to the code that renders hostile output, because the
/// webview is no longer the thing doing them.
///
/// And a control that cannot be refused cannot fail silently. The frontend
/// called `void closeWindow()` and swallowed the rejection, so a denied
/// permission looked exactly like a button that does nothing — which is what
/// it looked like, and what it was.
///
/// The window is the calling one, injected by the core, and is deliberately
/// not a label the caller names. A label would hand back the reach the
/// capability was narrowed to remove: application commands are not gated by
/// the ACL, so any document could close any window — including the credential
/// prompt, whose own capability is empty precisely so that nothing in the main
/// webview can touch it (ADR-0008).
#[tauri::command]
pub async fn window_action<R: Runtime>(
    window: WebviewWindow<R>,
    request: WindowRequest,
) -> Result<(), IpcError> {
    let outcome = match request {
        WindowRequest::Minimize => window.minimize(),
        WindowRequest::ToggleMaximize => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        /* `destroy` rather than `close`: close asks, and asking is how a
        window ends up waiting on an answer nobody sends. Nothing here needs
        to veto it. */
        WindowRequest::Close => window.destroy(),
    };

    outcome.map_err(|_| Error::WindowActionRefused)?;
    Ok(())
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
            command_modifier: CommandModifier::Meta,
        })
        .expect("serializes");
        let application = serde_json::to_string(&WindowChrome {
            controls: Controls::Application,
            leading_inset: 0,
            command_modifier: CommandModifier::Control,
        })
        .expect("serializes");

        assert_eq!(
            system,
            r#"{"controls":"system","leadingInset":78,"commandModifier":"meta"}"#
        );
        assert_eq!(
            application,
            r#"{"controls":"application","leadingInset":0,"commandModifier":"control"}"#
        );
    }

    #[test]
    fn the_requests_are_named_the_way_the_frontend_sends_them() {
        /* The only thing standing between `toggleMaximize` and a button that
        rejects every time it is pressed. The matching literals are in
        src/ipc/chrome.ts. */
        for (wire, expected) in [
            (r#""minimize""#, WindowRequest::Minimize),
            (r#""toggleMaximize""#, WindowRequest::ToggleMaximize),
            (r#""close""#, WindowRequest::Close),
        ] {
            assert_eq!(
                serde_json::from_str::<WindowRequest>(wire).expect("deserializes"),
                expected
            );
        }

        /* And nothing else. An unknown request is a rejection, not a default
        that quietly closes the window. */
        assert!(serde_json::from_str::<WindowRequest>(r#""quit""#).is_err());
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
    fn the_shortcut_modifier_follows_the_platform() {
        /* A macOS user pressing Ctrl-Shift-P gets nothing, and a hint that
        says Ctrl on a Mac is worse than no hint. */
        assert_eq!(chrome_for(true).command_modifier, CommandModifier::Meta);
        assert_eq!(chrome_for(false).command_modifier, CommandModifier::Control);
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
