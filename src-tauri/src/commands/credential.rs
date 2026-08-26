//! Collecting a credential in its own window.
//!
//! ADR-0008: the prompt lives in a window that never renders a byte a remote
//! host chose, and is destroyed once it has answered. This module is the whole
//! lifecycle — open, wait, authenticate, destroy — because the failure modes
//! the ADR names are all *between* those steps, and splitting them across
//! callers is how one of them ends up unhandled.
//!
//! The window is created here rather than by the webview on purpose. Letting
//! the frontend open windows means granting it `allow-create-webview-window`
//! permanently, to the same code that renders hostile output. The privileged
//! side already knows when a credential is needed; it does not need to be
//! asked to open a window, only told the answer.

use tauri::{AppHandle, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::commands::chrome::MAIN_WINDOW;
use crate::commands::sessions::{from_stored, persist_credential, saved_session, to_stored};
use crate::error::{Error, IpcError};
use crate::ssh::credentials::{Answer, CredentialPrompt, CredentialRequests, Keep, RequestId};
use crate::ssh::registry::{Busy, Registry, SessionHandle};
use crate::vault::{Availability, CredentialId, Secret, SessionSecrets, StoredCredential, Vault};

/// What became of a credential the user asked to keep.
///
/// Returned rather than discarded, which is the whole of #167. A keychain that
/// refuses must not undo a connection that worked, and the old code was right
/// about that and then said nothing, so the box went on being ticked to no
/// effect for as long as somebody had patience.
///
/// Deliberately not an error. The session is authenticated, the user has what
/// they asked for, and failing the call over a convenience would be worse than
/// the thing it is reporting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Keeping {
    /// The user did not ask for it to be kept.
    NotAsked,
    Kept,
    /// The user asked and the store refused. Covers a locked keyring, a
    /// revoked permission, and a keychain that went away while the application
    /// was open, none of which `Availability` reports as unavailable.
    Refused,
}

/// The label the prompt window is created under.
pub const CREDENTIAL_WINDOW: &str = "credential";

/// The document the prompt window loads.
///
/// Its own entry point, not a route inside the main one. That is what makes
/// ADR-0008's "nothing remote is ever routed to it" a property of the build
/// rather than a promise about which component renders: the terminal is not in
/// this bundle at all. `tests/credential-window.test.ts` fails if it appears.
const CREDENTIAL_DOCUMENT: &str = "credential.html";

/// Opens the prompt, waits for it, and authenticates with what comes back.
///
/// Returns `credentialDismissed` when the user closes or cancels. Deliberately
/// an error and never a silent retry: a client that re-prompts on its own is
/// how someone ends up typing a password into a window they did not summon.
#[tauri::command]
pub async fn authenticate_interactively<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, Registry>,
    requests: State<'_, CredentialRequests>,
    vault: State<'_, Vault>,
    secrets: State<'_, SessionSecrets>,
    handle: SessionHandle,
) -> Result<Keeping, IpcError> {
    let session_id = registry
        .session_of(handle)
        .await
        .ok_or(Error::UnknownHandle)?;
    let session = saved_session(&app, &session_id)?;

    let prompt = CredentialPrompt {
        session_name: session.name.clone(),
        user: session.user.clone(),
        host: session.host.clone(),
        port: session.port,
        can_remember: matches!(vault.availability(), Availability::Available),
        /* The host the user clicked. Nothing is being crossed on the way to
        anywhere, which is what `None` says. */
        carrying: None,
    };

    let (credential, keep) = ask(&app, &requests, prompt).await?;

    /* Encoded before authenticating, because authenticating consumes the
    credential. Written only once the host has accepted it: saving a secret
    the server refused is how a keychain fills up with typos. */
    let keepsake = match keep {
        Keep::Never => None,
        Keep::ForThisRun | Keep::Stored => Some(credential.encode()?),
    };

    let credential = from_stored(credential);

    let outcome = registry
        .with(handle, |mut busy: Busy| async move {
            let result = busy.connection.authenticate(&busy.user, credential).await;
            (busy, result)
        })
        .await
        .ok_or(Error::UnknownHandle)?;

    outcome.map_err(Box::new)?;

    /* A keychain that refuses must not undo a connection that worked: the
    session is authenticated either way. But it is reported rather than
    swallowed, because a tick box that does nothing and says nothing is worse
    than one that is not offered. */
    let Some(secret) = keepsake else {
        return Ok(Keeping::NotAsked);
    };

    /* Kept for this run goes nowhere near a disk, so there is nothing that can
    refuse it and nothing to report. ADR-0025. */
    if keep == Keep::ForThisRun {
        secrets.keep(&CredentialId::for_session(&session_id), &secret);
        return Ok(Keeping::Kept);
    }

    match persist_credential(&app, &vault, &session_id, &secret) {
        Ok(()) => Ok(Keeping::Kept),
        Err(_) => Ok(Keeping::Refused),
    }
}

/// What the prompt window renders.
///
/// Facts about the session, and nothing a host chose.
#[tauri::command]
pub async fn credential_prompt(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
) -> Result<CredentialPrompt, IpcError> {
    requests
        .describe(request)
        .await
        .ok_or(Error::UnknownRequest)
        .map_err(Into::into)
}

/// The reply from the prompt window.
///
/// The secret arrives here and goes straight down the channel to the waiting
/// connection. It is not stored, not echoed, and not logged.
#[tauri::command]
pub async fn submit_credential(
    requests: State<'_, CredentialRequests>,
    request: RequestId,
    password: Option<Secret>,
    private_key: Option<Secret>,
    passphrase: Option<Secret>,
    keep: Keep,
) -> Result<(), IpcError> {
    let credential = to_stored(password, private_key, passphrase)?;

    let delivered = requests
        .answer(request, Answer::Submitted { credential, keep })
        .await;

    /* An unmatched or repeated id is refused, which is ADR-0008's protocol
    verbatim. It is also what stops a window left open from an earlier attempt
    from authenticating a session nobody asked it about. */
    if delivered {
        Ok(())
    } else {
        Err(Error::UnknownRequest.into())
    }
}

/// The user cancelled, or the window has nothing it can do.
///
/// The request is optional, and the window is closed either way. That is not a
/// convenience: the prompt reaches its error state precisely when it could not
/// find its request, and a Cancel button that needs a request to work is inert
/// in the one state where it is the only thing left. Shipped exactly that once
/// — a window whose only button did nothing.
#[tauri::command]
pub async fn dismiss_credential<R: Runtime>(
    app: AppHandle<R>,
    requests: State<'_, CredentialRequests>,
    request: Option<RequestId>,
) -> Result<(), IpcError> {
    if let Some(request) = request {
        requests.answer(request, Answer::Dismissed).await;
    }

    /* Closed by the core rather than by the window, so the window needs no
    permission to close itself and its capability can stay empty. */
    close_window(&app);
    Ok(())
}

/// The URL the prompt window is opened on.
///
/// Split out because it was wrong and nothing noticed. `RequestId` renders as
/// `request-N` so a log line names nothing about the session; interpolating it
/// here produced `?request=request-0`, which the window parsed as `NaN` and
/// reported as a prompt that no longer existed. Every credential prompt opened
/// onto that message.
#[must_use]
pub fn prompt_url(request: RequestId) -> String {
    format!("{CREDENTIAL_DOCUMENT}?request={}", request.raw())
}

/// Builds the prompt window and wires its close event to a dismissal.
/// Opens the prompt window, waits for it, and returns what the user typed.
///
/// Extracted so a bastion can ask as well. ADR-0027 lets the core prompt for a
/// hop the user did not click, and the thing that must not be duplicated to do
/// that is this sequence: a request that is always answered, a window that is
/// always destroyed, and a dismissal that is an error rather than a retry.
///
/// The returned credential is the shape the keychain holds, because a caller
/// that was asked to keep it needs it written as well as used, and converting
/// once means the secret is not copied a second time to satisfy the second use.
pub(crate) async fn ask<R: Runtime>(
    app: &AppHandle<R>,
    requests: &CredentialRequests,
    prompt: CredentialPrompt,
) -> Result<(StoredCredential, Keep), Error> {
    let (request, answer) = requests.open(prompt).await;

    if let Err(failure) = open_window(app, request) {
        /* Nobody can answer a window that did not open, so the request is
        closed here rather than left for a reply that cannot arrive. */
        requests.answer(request, Answer::Dismissed).await;
        return Err(failure);
    }

    /* The sender is held by the request; it is answered by a submit, by a
    cancel, or by the window's own close event. There is no fourth way for
    this to resolve, which is what keeps a connection from waiting forever. */
    let answer = answer.await.map_err(|_| Error::CredentialDismissed)?;

    close_window(app);

    match answer {
        Answer::Submitted { credential, keep } => Ok((credential, keep)),
        Answer::Dismissed => Err(Error::CredentialDismissed),
    }
}

/// How tall the prompt window is.
///
/// **One figure for every prompt**, which is the point of it rather than an
/// accident. There were two, chosen from whether a jump host was being asked
/// about, and the pair went wrong three times: a hop paragraph that pushed the
/// buttons off the bottom, a title bar drawn inside the surface that took 47
/// points nobody had budgeted, and a private key field that needed more than
/// either figure allowed. Every one of those was a number here disagreeing with
/// a component in a webview, and two numbers are two chances to disagree.
///
/// So this is the tallest thing the window can be asked to render, and it was
/// measured rather than estimated, by opening the window at 900 and reading off
/// where the content stopped. Three of the four numbers this file has carried
/// were estimates and all three were short.
///
/// In Brazilian Portuguese, the longest of the three catalogues, asking for a
/// private key, which is the tallest of the three prompts:
///
/// | | content | window it needs |
/// | --- | --- | --- |
/// | a password | 360 | 360 |
/// | a jump host, with its paragraph | 450 | 450 |
/// | a private key and its passphrase | 528 | 528 |
///
/// A password prompt is 200 points short of that and carries the difference as
/// space under the fields, which is the trade taken on purpose. Empty space
/// reads as a dialog with room in it. A scrollbar over a credential form reads
/// as something gone wrong.
///
/// This is the whole of what the document gets. The window is undecorated since
/// ADR-0028, so nothing is drawn inside the surface to take a share of it.
///
/// The action row still sits outside the part that scrolls, for the machine
/// whose fonts nobody here picked. What has to survive a disagreement is the
/// window staying answerable.
const PROMPT_HEIGHT: f64 = 560.0;

/// How wide the prompt is, which does not depend on what it says.
///
/// The same 560 the host key screens are drawn at, because the prompt renders
/// the same shape and a shape is not the same shape at two widths. It is also
/// what makes the keep options fit on one line each in every catalogue; at 440
/// the Portuguese wrapped, and wrapping was half of what pushed them out of
/// sight.
///
/// A constant rather than a literal because the placement below has to know
/// it: a window is centred over another one by subtracting its own size, and
/// reading that size from the builder is not something the builder offers.
const PROMPT_WIDTH: f64 = 560.0;

/// Where to open the prompt so it sits in the middle of the window that asked.
///
/// Takes the parent's origin and size in physical pixels, which is what
/// `outer_position` and `outer_size` report, and returns logical points, which
/// is what the builder takes. The conversion is the whole of this function and
/// the reason it exists separately: getting it backwards puts the prompt at
/// twice the offset on a display that scales, which is a bug nobody sees until
/// somebody with a high resolution screen opens one.
///
/// The parent's scale factor is used for both, on the assumption that a window
/// centred inside another one is on the same display as it. That holds by
/// construction here: the prompt is narrower and shorter than the smallest the
/// main window is allowed to be, so its rectangle is always inside the
/// parent's.
fn centre_over(origin: (i32, i32), size: (u32, u32), scale: f64, prompt: (f64, f64)) -> (f64, f64) {
    let left = f64::from(origin.0) / scale;
    let top = f64::from(origin.1) / scale;

    (
        left + (f64::from(size.0) / scale - prompt.0) / 2.0,
        top + (f64::from(size.1) / scale - prompt.1) / 2.0,
    )
}

/// Pulls a placement back onto the screen it is meant to be on.
///
/// Centring over the main window is right until the prompt is taller than the
/// main window, and then it hangs off both ends. An earlier version avoided
/// that by keeping the prompt smaller than the main window is allowed to be,
/// which sounds tidy and is a ceiling on the content: it put the limit at 464
/// points, and the prompt a jump host asks needs more than that to show every
/// keep option in Portuguese. A window that is the wrong size for what it says
/// is worse than one that needed a clamp.
///
/// The work area rather than the whole monitor, so a placement never lands
/// under a task bar or a dock. Clamps the origin only: a prompt taller than the
/// work area is not made to fit, because the alternative is deciding which end
/// of it to cut off, and it scrolls.
fn clamp_into(placement: (f64, f64), work: (f64, f64, f64, f64), prompt: (f64, f64)) -> (f64, f64) {
    let (left, top, width, height) = work;

    /* `max` after `min`, so a prompt larger than the work area lands at its
    top left corner rather than off the near edge. */
    (
        placement.0.min(left + width - prompt.0).max(left),
        placement.1.min(top + height - prompt.1).max(top),
    )
}

fn open_window<R: Runtime>(app: &AppHandle<R>, request: RequestId) -> Result<(), Error> {
    /* A window left over from an abandoned attempt would take the label and
    make this one fail to build. */
    close_window(app);

    /* Through `prompt_url`, and never built here. The last attempt at this
    bug added that helper, gave it three tests, and left this line interpolating
    the `Display` form — so the tests passed and every prompt still opened on
    `?request=request-0`. One construction site is the fix; the second one was
    the bug. */
    let url = prompt_url(request);

    /* The window that asked, when there is one. Everything below degrades to
    what shipped before rather than failing: a prompt centred on the screen is
    worse than one centred on the application, and both are better than a
    connection waiting on a window that was never opened. */
    let main = app.get_webview_window(MAIN_WINDOW);

    /* Read from the main window, not from the prompt, because the prompt does
    not exist yet and the builder cannot be asked where it would land. */
    let placement = main.as_ref().and_then(|main| {
        let scale = main.scale_factor().ok()?;
        let origin = main.outer_position().ok()?;
        let size = main.outer_size().ok()?;
        let prompt = (PROMPT_WIDTH, PROMPT_HEIGHT);

        let centred = centre_over(
            (origin.x, origin.y),
            (size.width, size.height),
            scale,
            prompt,
        );

        /* The monitor is a second question, and a failed answer to it is not a
        reason to place nothing. Without one the prompt is centred and not
        clamped, which is exactly what a main window bigger than the prompt
        would have produced anyway. */
        let Ok(Some(monitor)) = main.current_monitor() else {
            return Some(centred);
        };

        let work = monitor.work_area();

        Some(clamp_into(
            centred,
            (
                f64::from(work.position.x) / scale,
                f64::from(work.position.y) / scale,
                f64::from(work.size.width) / scale,
                f64::from(work.size.height) / scale,
            ),
            prompt,
        ))
    });

    /* Built in a closure because parenting can fail and takes the builder with
    it when it does. There is no way to hand a builder back out of an `Err`, so
    the unparented window is built from the start rather than recovered. */
    let build = || {
        let builder =
            WebviewWindowBuilder::new(app, CREDENTIAL_WINDOW, WebviewUrl::App(url.clone().into()))
                .title("Runic SSH")
                .inner_size(PROMPT_WIDTH, PROMPT_HEIGHT)
                .resizable(false)
                .minimizable(false)
                /* ADR-0008: "on some window managers a second window can open behind the
                main one or without focus, which is a usability failure that reads as the
                application hanging". Both are asked for explicitly. */
                .focused(true)
                .always_on_top(true)
                /* Undecorated, like every other window this application opens.
                ADR-0028.
                This one carried the desktop's title bar until the main window's
                Cancel could close it. That was ADR-0008's answer to its own
                worst failure, a prompt whose script never runs leaving a
                connection waiting on a reply that cannot come: the window
                manager's close button works whether or not anything of ours
                does. The replacement is a control in a different document with
                a different script, which survives the same failure, and it had
                to be built anyway because cancelling used to leave the prompt
                standing. #193.
                The title bar was also spending the window. A desktop that draws
                it inside the surface takes it out of what the document gets, 47
                points of 420 where that was measured, and the height below is
                chosen in Rust against content in a webview with no way to find
                that out. It means what it says now. */
                .decorations(false);

        match placement {
            Some((x, y)) => builder.position(x, y),
            None => builder.center(),
        }
    };

    /* Owned by the application rather than standing beside it. The desktop
    stacks it over the window that asked, groups it with us in the task
    switcher, and takes it away when we go. On Windows an owned window is also
    hidden while its owner is minimised, which is the one visible cost: the
    prompt goes with the window and comes back with it. */
    let window = match main.as_ref().map(|main| build().parent(main)) {
        Some(Ok(parented)) => parented,
        /* A main window that was there a moment ago and cannot produce a
        native handle now, which is what shutting down looks like from here.
        Unparented is worse than parented and better than nothing at all. */
        Some(Err(_)) | None => build(),
    }
    .build()
    .map_err(|_| Error::PromptUnavailable)?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            let app = handle.clone();
            tauri::async_runtime::spawn(async move {
                /* Take-once, so this is a no-op when the window is closing
                because it already submitted. */
                app.state::<CredentialRequests>()
                    .answer(request, Answer::Dismissed)
                    .await;
            });
        }
    });

    Ok(())
}

fn close_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CREDENTIAL_WINDOW) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_prompt_window_still_sends_what_this_command_takes() {
        /* The three secret arguments became `Option<Secret>` under ADR-0026,
        and nothing else in the gate would notice if that changed the wire.
        The literal below is what `submitCredential` in `src/ipc/credential.ts`
        builds, absent fields included: it sends `null` rather than omitting
        them, so `Option` has to accept both. */
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Sent {
            password: Option<Secret>,
            private_key: Option<Secret>,
            passphrase: Option<Secret>,
        }

        let typed: Sent =
            serde_json::from_str(r#"{"password":"hunter2","privateKey":null,"passphrase":null}"#)
                .expect("a password the window sent");
        assert_eq!(typed.password.as_ref().map(Secret::expose), Some("hunter2"));
        assert!(typed.private_key.is_none() && typed.passphrase.is_none());

        let typed: Sent = serde_json::from_str(
            r#"{"password":null,"privateKey":"-----BEGIN-----","passphrase":"phrase"}"#,
        )
        .expect("a key the window sent");
        assert_eq!(
            typed.private_key.as_ref().map(Secret::expose),
            Some("-----BEGIN-----")
        );
        assert_eq!(
            typed.passphrase.as_ref().map(Secret::expose),
            Some("phrase")
        );
    }

    #[test]
    fn the_prompt_is_centred_in_logical_points_and_not_physical_ones() {
        /* A parent 1000 by 800 physical pixels at (100, 50), on a display that
        scales by two: 500 by 400 logical points at (50, 25). A 440 by 340
        prompt has 60 points of slack in each direction, so it starts 30 in.

        The number that catches the mistake is the origin. Dividing the size
        and forgetting the position is the shape this bug takes, and at scale
        one it is invisible. */
        let (x, y) = centre_over((100, 50), (1000, 800), 2.0, (440.0, 340.0));

        assert!((x - 80.0).abs() < f64::EPSILON, "x was {x}");
        assert!((y - 55.0).abs() < f64::EPSILON, "y was {y}");
    }

    #[test]
    fn a_prompt_never_lands_under_a_top_bar() {
        /* A main window pushed to the top of the screen. Centring a prompt
        over it puts the prompt above the work area, behind whatever the
        desktop keeps up there, and the part that goes under is the heading:
        the line that says which host is being asked about. */
        let work = (0.0, 32.0, 1920.0, 1008.0);
        let prompt = (PROMPT_WIDTH, PROMPT_HEIGHT);

        let centred = centre_over((520, 0), (880, 560), 1.0, prompt);
        assert!(centred.1 < 32.0, "the case needs the prompt to reach up");

        let (x, y) = clamp_into(centred, work, prompt);
        assert!(y >= 32.0, "top was {y}");
        assert!(x >= 0.0 && x + prompt.0 <= 1920.0);
        assert!(y + prompt.1 <= 32.0 + 1008.0);
    }

    #[test]
    fn a_prompt_never_lands_under_the_task_bar() {
        /* The work area, not the monitor. A main window at the bottom of the
        screen centres a prompt into whatever the desktop has reserved down
        there, and a prompt with its buttons behind a task bar is the same
        failure as a prompt with its buttons off the bottom edge. */
        let work = (0.0, 32.0, 1920.0, 1008.0);
        let prompt = (PROMPT_WIDTH, PROMPT_HEIGHT);

        let centred = centre_over((600, 900), (880, 560), 1.0, prompt);
        let (_, y) = clamp_into(centred, work, prompt);

        assert!(y + prompt.1 <= 32.0 + 1008.0, "bottom was {}", y + prompt.1);
        assert!(y >= 32.0, "top was {y}");
    }

    #[test]
    fn a_prompt_bigger_than_the_screen_starts_at_the_corner() {
        /* Nothing can make it fit, and the choice is which end to lose. The
        near corner keeps the heading, which says which host is asking, and
        loses the bottom, which the window scrolls to reach. */
        let work = (0.0, 32.0, 400.0, 300.0);
        let prompt = (PROMPT_WIDTH, PROMPT_HEIGHT);

        let placed = clamp_into(centre_over((0, 0), (880, 560), 1.0, prompt), work, prompt);
        assert_eq!(placed, (0.0, 32.0));
    }

    /// Parses the URL the way the window does: split the query, read `request`.
    fn request_in(url: &str) -> Option<u64> {
        url.split_once("?request=")
            .map(|(_, value)| value)
            .and_then(|value| value.parse().ok())
    }

    #[test]
    fn the_window_can_read_the_request_out_of_its_own_url() {
        let (id, _receiver) = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("a runtime")
            .block_on(async {
                CredentialRequests::new()
                    .open(CredentialPrompt {
                        session_name: "web-01".to_owned(),
                        user: "deploy".to_owned(),
                        host: "10.0.4.31".to_owned(),
                        port: 22,
                        can_remember: false,
                        carrying: None,
                    })
                    .await
            });

        assert_eq!(request_in(&prompt_url(id)), Some(id.raw()));
    }

    #[test]
    fn the_url_carries_a_bare_number() {
        /* The direct guard. `?request=request-0` is what shipped, and the
        window turned it into NaN. */
        let url = prompt_url(RequestId::default_for_test(3));

        assert!(url.ends_with("?request=3"), "the URL is {url}");
        assert!(!url.contains("request=request"), "the URL is {url}");
    }

    #[test]
    fn the_document_is_the_prompt_and_not_the_main_window() {
        /* ADR-0008 rests on this window loading its own document. Loading
        index.html would put the terminal in the same context as the secret. */
        assert!(prompt_url(RequestId::default_for_test(0)).starts_with("credential.html"));
    }

    #[test]
    fn what_became_of_the_credential_crosses_as_three_words() {
        /* Pinned as a literal on both sides. Renaming a variant compiles in
        both languages and leaves the interface silent about a save that did
        not happen, which is the defect this enum exists to end (#167). */
        assert_eq!(
            serde_json::to_string(&Keeping::NotAsked).expect("serializes"),
            r#""notAsked""#
        );
        assert_eq!(
            serde_json::to_string(&Keeping::Kept).expect("serializes"),
            r#""kept""#
        );
        assert_eq!(
            serde_json::to_string(&Keeping::Refused).expect("serializes"),
            r#""refused""#
        );
    }

    #[test]
    fn a_refused_save_is_not_an_error() {
        /* The session is authenticated. Failing the call over a convenience
        would take down a connection that worked, which is worse than the
        thing being reported. */
        let refused: Result<Keeping, IpcError> = Ok(Keeping::Refused);
        assert!(refused.is_ok());
    }
}
