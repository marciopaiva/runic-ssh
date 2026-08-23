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
use tauri::{AppHandle, Runtime, WebviewWindow};

use crate::config::apply_native_decorations;
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
    /// Whether the window manager is drawing the title bar.
    ///
    /// Sent rather than derived. `Controls::System` with a zero inset means
    /// exactly this and nothing else, so the webview *could* work it out — and
    /// then two files would encode the same three-way distinction, one of them
    /// as a pair of coincidences. The core knows; it says so.
    pub native_decorations: bool,
}

/// The width the macOS traffic lights occupy, plus their inset.
///
/// Apple places three 12pt buttons on 20pt centres starting 20pt from the
/// leading edge, which ends at 72. The extra six is the gap that keeps a tab
/// from looking welded to the close button. It is a number that tracks Apple's
/// placement rather than a token, which ADR-0005 named as a cost of Option C.
const MACOS_TRAFFIC_LIGHTS: u16 = 78;

/// How the title area is arranged, which is not a two-sided question.
///
/// It was a `bool` while there were two answers. The setting ADR-0005 asked
/// for adds a third, and it collides with the first: both let the system draw
/// the controls, and only one of them needs space reserved. A boolean cannot
/// say that, and the version that tried said `System` where it meant `macOS`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TitleArea {
    /// macOS. Native traffic lights float over our bar, so we keep clear.
    Overlay,
    /// Windows and Linux as designed. No decorations, so the controls are ours.
    Undecorated,
    /// The escape hatch. The window manager draws a real title bar above our
    /// bar, so it owns the controls and there is nothing to keep clear of —
    /// the two are stacked, not overlapping.
    Native,
}

/// Describes the chrome for an arrangement, named rather than detected.
///
/// The arrangement is a parameter so every answer can be asserted from any
/// host. A `cfg!` inside the body would leave the branch this machine is not
/// on untested — and ADR-0005 named an under-tested cosmetic surface as the
/// cost it was accepting, which makes "untestable off macOS" the wrong shape.
#[must_use]
pub fn chrome_for(area: TitleArea) -> WindowChrome {
    match area {
        TitleArea::Overlay => WindowChrome {
            controls: Controls::System,
            leading_inset: MACOS_TRAFFIC_LIGHTS,
            command_modifier: CommandModifier::Meta,
            native_decorations: false,
        },
        TitleArea::Undecorated => WindowChrome {
            controls: Controls::Application,
            leading_inset: 0,
            command_modifier: CommandModifier::Control,
            native_decorations: false,
        },
        TitleArea::Native => WindowChrome {
            controls: Controls::System,
            leading_inset: 0,
            command_modifier: CommandModifier::Control,
            native_decorations: true,
        },
    }
}

/// Which arrangement this build is in, given what the user asked for.
///
/// The setting is ignored on macOS. There the controls are already the
/// system's and the window is already decorated in the way that platform
/// means it — honouring the flag would turn the traffic lights off, which is
/// the opposite of an escape hatch.
#[must_use]
pub fn title_area(native_decorations: bool) -> TitleArea {
    if cfg!(target_os = "macos") {
        TitleArea::Overlay
    } else if native_decorations {
        TitleArea::Native
    } else {
        TitleArea::Undecorated
    }
}

/// Describes the chrome for the platform this build targets.
///
/// Split from the command so the shape can be asserted without an app handle.
#[must_use]
pub fn chrome(native_decorations: bool) -> WindowChrome {
    chrome_for(title_area(native_decorations))
}

/// Tells the webview how to lay out the title area.
///
/// Reads the settings rather than taking a parameter: the layout has to match
/// the window the user is actually looking at, and a caller that passed its
/// own idea of the setting could disagree with the window.
///
/// Unreadable settings fall back to the designed arrangement instead of
/// failing. A malformed file is worth surfacing — `get_settings` does that —
/// but not by refusing to tell the titlebar how tall it is.
#[tauri::command]
pub async fn window_chrome<R: Runtime>(app: AppHandle<R>) -> WindowChrome {
    let native = crate::commands::settings::store(&app)
        .and_then(|store| store.load())
        .map(|settings| settings.native_decorations)
        .unwrap_or(false);

    chrome(native)
}

/// Applies the stored decoration preference to the window at startup.
///
/// Every failure here is swallowed on purpose, and the reasons differ. An
/// unreadable settings file is already reported by `get_settings`, where the
/// user can see it; a window manager that refuses the change leaves the
/// designed chrome, which is the state the application ships in. Neither is a
/// reason to fail a launch, and `setup` returning `Err` does exactly that.
pub fn restore_decorations<R: Runtime>(app: &AppHandle<R>) {
    let Ok(store) = crate::commands::settings::store(app) else {
        return;
    };
    let Ok(settings) = store.load() else {
        return;
    };

    /* Only when it differs from the built window. Calling `set_decorations`
    with the value the window already has is a no-op everywhere it works and a
    flicker on the compositors where it does not. */
    if !settings.native_decorations || cfg!(target_os = "macos") {
        return;
    }

    if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
        let _ = window.set_decorations(true);
    }
}

/// Hands the title bar back to the window manager, or takes it again.
///
/// ADR-0005's escape hatch, for a compositor that leaves an undecorated window
/// impossible to resize or move. Applied to the live window *and* stored,
/// which is not belt and braces: some window managers ignore a decoration
/// change on a mapped window, and for those the stored value is what makes the
/// setting work on the next launch. A user reaching for this may be unable to
/// move the window at all, so it has to work even when the live call does not.
///
/// The setting is honoured on Windows and Linux. macOS keeps its overlay
/// titlebar, where the controls are already the platform's own.
#[tauri::command]
pub async fn set_native_decorations<R: Runtime>(
    window: WebviewWindow<R>,
    native: bool,
) -> Result<WindowChrome, IpcError> {
    let app = tauri::Manager::app_handle(&window).clone();
    apply_native_decorations(&crate::commands::settings::store(&app)?, native)?;

    /* macOS is decorated either way; toggling there would remove the traffic
    lights, which is the opposite of an escape hatch. */
    if !cfg!(target_os = "macos") {
        window
            .set_decorations(native)
            .map_err(|_| Error::WindowActionRefused)?;
    }

    Ok(chrome(native))
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
    act_on(&window, request)
}

/// The five window operations a control we drew can ask for.
///
/// A trait rather than the window itself, so the refusal path can be reached
/// from a test. It cannot be reached any other way: Tauri's own `MockRuntime`
/// returns `Ok` from `minimize`, `maximize` and `unmaximize` unconditionally,
/// and ADR-0012 shipped with the code that reports a refusal never once having
/// run. The implementation below is pure delegation; the behaviour under test
/// is all in [`act_on`].
trait WindowControl {
    fn is_maximized(&self) -> tauri::Result<bool>;
    fn minimize(&self) -> tauri::Result<()>;
    fn maximize(&self) -> tauri::Result<()>;
    fn unmaximize(&self) -> tauri::Result<()>;
    fn destroy(&self) -> tauri::Result<()>;
}

impl<R: Runtime> WindowControl for WebviewWindow<R> {
    /* Spelled out rather than `self.minimize()`. The inherent method wins
    method resolution, so the short form would work and would also be one
    rename away from recursing into itself. */
    fn is_maximized(&self) -> tauri::Result<bool> {
        WebviewWindow::is_maximized(self)
    }

    fn minimize(&self) -> tauri::Result<()> {
        WebviewWindow::minimize(self)
    }

    fn maximize(&self) -> tauri::Result<()> {
        WebviewWindow::maximize(self)
    }

    fn unmaximize(&self) -> tauri::Result<()> {
        WebviewWindow::unmaximize(self)
    }

    fn destroy(&self) -> tauri::Result<()> {
        WebviewWindow::destroy(self)
    }
}

/// Carries out a request, and reports a window that would not.
fn act_on(window: &impl WindowControl, request: WindowRequest) -> Result<(), IpcError> {
    let outcome = match request {
        WindowRequest::Minimize => window.minimize(),
        /* A window that cannot say whether it is maximized is treated as not
        maximized, because the alternative is a button that refuses over a
        question nobody asked it. */
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

    /* The refusal reaches the user as a code, never as the platform's own
    text: that string is written by something we do not audit. */
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
        let system = serde_json::to_string(&chrome_for(TitleArea::Overlay)).expect("serializes");
        let application =
            serde_json::to_string(&chrome_for(TitleArea::Undecorated)).expect("serializes");
        let native = serde_json::to_string(&chrome_for(TitleArea::Native)).expect("serializes");

        assert_eq!(
            system,
            r#"{"controls":"system","leadingInset":78,"commandModifier":"meta","nativeDecorations":false}"#
        );
        assert_eq!(
            application,
            r#"{"controls":"application","leadingInset":0,"commandModifier":"control","nativeDecorations":false}"#
        );
        assert_eq!(
            native,
            r#"{"controls":"system","leadingInset":0,"commandModifier":"control","nativeDecorations":true}"#
        );
    }

    /// A window that answers every request, and records what it was asked.
    #[derive(Default)]
    struct Spy {
        maximized: bool,
        /* Interior mutability, because `WindowControl` takes `&self` — the
        real implementation is a handle to a window the core owns, not
        something a command holds by value. */
        calls: std::cell::RefCell<Vec<&'static str>>,
    }

    impl Spy {
        fn calls(&self) -> Vec<&'static str> {
            self.calls.borrow().clone()
        }
    }

    impl WindowControl for Spy {
        fn is_maximized(&self) -> tauri::Result<bool> {
            Ok(self.maximized)
        }

        fn minimize(&self) -> tauri::Result<()> {
            self.calls.borrow_mut().push("minimize");
            Ok(())
        }

        fn maximize(&self) -> tauri::Result<()> {
            self.calls.borrow_mut().push("maximize");
            Ok(())
        }

        fn unmaximize(&self) -> tauri::Result<()> {
            self.calls.borrow_mut().push("unmaximize");
            Ok(())
        }

        fn destroy(&self) -> tauri::Result<()> {
            self.calls.borrow_mut().push("destroy");
            Ok(())
        }
    }

    /// A window that refuses everything, the way a real one can and the mock
    /// runtime cannot.
    struct Refuses;

    impl WindowControl for Refuses {
        fn is_maximized(&self) -> tauri::Result<bool> {
            Err(tauri::Error::WindowNotFound)
        }

        fn minimize(&self) -> tauri::Result<()> {
            Err(tauri::Error::WindowNotFound)
        }

        fn maximize(&self) -> tauri::Result<()> {
            Err(tauri::Error::WindowNotFound)
        }

        fn unmaximize(&self) -> tauri::Result<()> {
            Err(tauri::Error::WindowNotFound)
        }

        fn destroy(&self) -> tauri::Result<()> {
            Err(tauri::Error::WindowNotFound)
        }
    }

    #[test]
    fn a_window_that_refuses_is_reported_and_not_swallowed() {
        /* ADR-0012's open follow-up, and the first time this line has run.
        The whole point of routing these through a command was that a control
        which cannot act says so — a refusal returned as `Ok` would put the
        application back where it started, with a button indistinguishable
        from one nobody wired up. */
        for request in [
            WindowRequest::Minimize,
            WindowRequest::ToggleMaximize,
            WindowRequest::Close,
        ] {
            assert_eq!(
                act_on(&Refuses, request),
                Err(IpcError::WindowActionRefused),
                "{request:?} was not reported as a refusal"
            );
        }
    }

    #[test]
    fn each_request_reaches_the_operation_it_names() {
        /* A swapped arm here is a close button that minimises. Nothing else
        would notice: every arm returns the same `Ok(())`. */
        let spy = Spy::default();
        assert_eq!(act_on(&spy, WindowRequest::Minimize), Ok(()));
        assert_eq!(spy.calls(), vec!["minimize"]);

        let spy = Spy::default();
        assert_eq!(act_on(&spy, WindowRequest::Close), Ok(()));
        assert_eq!(
            spy.calls(),
            vec!["destroy"],
            "close must destroy, not close"
        );
    }

    #[test]
    fn toggling_reads_the_window_before_deciding_which_way() {
        let restored = Spy::default();
        assert_eq!(act_on(&restored, WindowRequest::ToggleMaximize), Ok(()));
        assert_eq!(restored.calls(), vec!["maximize"]);

        let maximized = Spy {
            maximized: true,
            ..Spy::default()
        };
        assert_eq!(act_on(&maximized, WindowRequest::ToggleMaximize), Ok(()));
        assert_eq!(maximized.calls(), vec!["unmaximize"]);
    }

    #[test]
    fn a_window_that_cannot_say_whether_it_is_maximized_still_acts() {
        /* `is_maximized` is asked as a question, not as permission. Refusing
        the whole request because the answer did not arrive would break the
        button over something the user never asked about. */
        struct Mute(std::cell::RefCell<Vec<&'static str>>);

        impl WindowControl for Mute {
            fn is_maximized(&self) -> tauri::Result<bool> {
                Err(tauri::Error::WindowNotFound)
            }

            fn minimize(&self) -> tauri::Result<()> {
                Ok(())
            }

            fn maximize(&self) -> tauri::Result<()> {
                self.0.borrow_mut().push("maximize");
                Ok(())
            }

            fn unmaximize(&self) -> tauri::Result<()> {
                Ok(())
            }

            fn destroy(&self) -> tauri::Result<()> {
                Ok(())
            }
        }

        let mute = Mute(std::cell::RefCell::new(Vec::new()));
        assert_eq!(act_on(&mute, WindowRequest::ToggleMaximize), Ok(()));
        assert_eq!(mute.0.borrow().clone(), vec!["maximize"]);
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
        let macos = chrome_for(TitleArea::Overlay);

        assert_eq!(macos.controls, Controls::System);
        assert!(
            macos.leading_inset > 0,
            "the tab strip would be drawn under the traffic lights"
        );
    }

    #[test]
    fn an_undecorated_window_gets_controls_of_its_own() {
        assert_eq!(
            chrome_for(TitleArea::Undecorated).controls,
            Controls::Application
        );
    }

    #[test]
    fn a_natively_decorated_window_draws_no_controls_and_reserves_no_space() {
        /* The reason `TitleArea` is not a bool. Both this and Overlay leave
        the controls to the system, and only one of them needs space kept
        clear: on macOS the traffic lights float *over* our bar, and here the
        window manager's title bar sits *above* it. Reserving 78 pixels here
        would put a permanent empty gap at the leading edge of the tab strip,
        which looks like a layout bug and is one. */
        let native = chrome_for(TitleArea::Native);

        assert_eq!(native.controls, Controls::System, "the WM draws them");
        assert_eq!(
            native.leading_inset, 0,
            "nothing overlaps our bar, so nothing is reserved"
        );
    }

    #[test]
    fn only_the_overlay_reserves_space() {
        for area in [
            TitleArea::Overlay,
            TitleArea::Undecorated,
            TitleArea::Native,
        ] {
            let reserved = chrome_for(area).leading_inset > 0;
            assert_eq!(
                reserved,
                area == TitleArea::Overlay,
                "{area:?} reserves the wrong amount of leading space"
            );
        }
    }

    #[test]
    fn the_escape_hatch_is_ignored_on_macos() {
        /* Honouring it there would turn the traffic lights off, which is the
        opposite of an escape hatch: it takes away the platform's own controls
        from the one platform that was drawing them correctly. */
        if cfg!(target_os = "macos") {
            assert_eq!(title_area(true), TitleArea::Overlay);
            assert_eq!(title_area(false), TitleArea::Overlay);
        } else {
            assert_eq!(title_area(true), TitleArea::Native);
            assert_eq!(title_area(false), TitleArea::Undecorated);
        }
    }

    #[test]
    fn the_default_is_the_designed_chrome() {
        /* ADR-0005 said to default this off. A build that defaulted it on
        would ship the escape hatch as the design. */
        assert_ne!(title_area(false), TitleArea::Native);
    }

    #[test]
    fn the_shortcut_modifier_follows_the_platform() {
        /* A macOS user pressing Ctrl-Shift-P gets nothing, and a hint that
        says Ctrl on a Mac is worse than no hint. */
        assert_eq!(
            chrome_for(TitleArea::Overlay).command_modifier,
            CommandModifier::Meta
        );
        for area in [TitleArea::Undecorated, TitleArea::Native] {
            assert_eq!(
                chrome_for(area).command_modifier,
                CommandModifier::Control,
                "{area:?}"
            );
        }
    }

    #[test]
    fn space_is_only_reserved_for_controls_somebody_else_draws() {
        /* An inset with application-drawn controls is a strip of dead pixels
        at the leading edge that nothing ever fills. */
        for area in [
            TitleArea::Overlay,
            TitleArea::Undecorated,
            TitleArea::Native,
        ] {
            let chrome = chrome_for(area);

            if chrome.controls == Controls::Application {
                assert_eq!(chrome.leading_inset, 0);
            }
        }
    }

    #[test]
    fn this_build_answers_for_the_platform_it_targets() {
        /* The only assertion that has to run per-platform: that `chrome()`
        asks the question the right way round. */
        assert_eq!(chrome(false), chrome_for(title_area(false)));
        assert_eq!(chrome(true), chrome_for(title_area(true)));
    }
}
