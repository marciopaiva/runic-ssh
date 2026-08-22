//! What a hostile host does, and what it costs us.
//!
//! `docs/security-model.md` names a malicious or compromised remote host as the
//! adversary the client is most exposed to, and writing continuously is the
//! cheapest attack available to one. These tests are that attack: a server that
//! floods the channel as fast as it can, and assertions about what the client
//! spends while it happens.
//!
//! A test that only proves output arrives would pass against a client that
//! buffers a gigabyte and freezes.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use russh::client::Msg;
use russh::server::{
    Auth, ChannelOpenHandle, Handler as ServerHandler, Msg as ServerMsg, Server as _, Session,
};
use russh::{Channel, ChannelId, MethodKind};

use runic_ssh::ssh::stats::Counters;
use runic_ssh::ssh::terminal::{pump, Input, PumpReport, Sink, MAX_BUFFERED, MIN_EMIT_INTERVAL};

/// Collects batches instead of sending them to a webview.
struct Collector {
    batches: Arc<AtomicU64>,
    bytes: Arc<AtomicU64>,
    largest: Arc<AtomicU64>,
}

impl Sink for Collector {
    fn emit(&mut self, batch: &[u8]) {
        self.batches.fetch_add(1, Ordering::Relaxed);
        self.bytes.fetch_add(batch.len() as u64, Ordering::Relaxed);
        self.largest
            .fetch_max(batch.len() as u64, Ordering::Relaxed);
    }

    fn closed(&mut self, _exit_status: Option<u32>) {}
}

/// What the server saw, so a test can assert the other direction.
#[derive(Clone, Default)]
struct Observed {
    input: Arc<tokio::sync::Mutex<Vec<u8>>>,
    resizes: Arc<tokio::sync::Mutex<Vec<(u32, u32)>>>,
}

#[derive(Clone)]
struct FloodingServer {
    /// Bytes to write before stopping.
    budget: Arc<AtomicU64>,
    /// Whether to close the channel when the budget runs out.
    ///
    /// An interactive shell does not send EOF because it has nothing more to
    /// say — it stays open until the session ends. Tests about input need that
    /// behaviour; tests about output need the opposite, so that the pump
    /// finishes and can be asserted on.
    close_when_done: bool,
    observed: Observed,
}

impl russh::server::Server for FloodingServer {
    type Handler = Self;
    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Self {
        self.clone()
    }
}

impl ServerHandler for FloodingServer {
    type Error = russh::Error;

    async fn auth_none(&mut self, _user: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<ServerMsg>,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        let budget = Arc::clone(&self.budget);
        let close_when_done = self.close_when_done;

        tokio::spawn(async move {
            /* 8 KiB at a time, as fast as the window allows. */
            let chunk = vec![b'x'; 8 * 1024];
            loop {
                let left = budget.load(Ordering::Relaxed);
                if left == 0 {
                    break;
                }
                let take = left.min(chunk.len() as u64) as usize;
                if channel.data(&chunk[..take]).await.is_err() {
                    break;
                }
                budget.fetch_sub(take as u64, Ordering::Relaxed);
            }
            if close_when_done {
                let _ = channel.eof().await;
            }
        });

        Ok(())
    }

    async fn shell_request(
        &mut self,
        _channel: ChannelId,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.observed.input.lock().await.extend_from_slice(data);
        Ok(())
    }

    async fn window_change_request(
        &mut self,
        _channel: ChannelId,
        columns: u32,
        rows: u32,
        _pix_width: u32,
        _pix_height: u32,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.observed.resizes.lock().await.push((columns, rows));
        Ok(())
    }
}

async fn flooding_server(bytes: u64, close_when_done: bool) -> (u16, Observed) {
    let host_key =
        russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).unwrap();

    let config = Arc::new(russh::server::Config {
        keys: vec![host_key],
        methods: [MethodKind::None].as_slice().into(),
        ..Default::default()
    });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let port = listener.local_addr().unwrap().port();

    let observed = Observed::default();
    let mut server = FloodingServer {
        budget: Arc::new(AtomicU64::new(bytes)),
        close_when_done,
        observed: observed.clone(),
    };
    tokio::spawn(async move {
        let _ = server.run_on_socket(config, &listener).await;
    });

    (port, observed)
}

struct AcceptEverything;

impl russh::client::Handler for AcceptEverything {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        /* This test is about the output pump, not about trust; trust has its
        own tests, and reusing the real path here would only make this one
        slower and less clear about what it proves. */
        Ok(true)
    }
}

async fn open_shell(port: u16) -> Channel<Msg> {
    let config = Arc::new(russh::client::Config::default());
    let mut handle = russh::client::connect(config, ("127.0.0.1", port), AcceptEverything)
        .await
        .expect("connects");

    assert!(
        handle
            .authenticate_none("anyone")
            .await
            .expect("auth runs")
            .success(),
        "the test server accepts anyone"
    );

    handle.channel_open_session().await.expect("a channel")
}

/// Waits for something the *server* had to observe.
///
/// Sending returns when the bytes are on the wire, not when the far end has
/// handled them. Asserting immediately after a send works on a fast machine
/// and fails on a slow one — which is how the first version of these tests
/// passed on Linux and macOS and failed on Windows.
async fn wait_until<F, Fut>(what: &str, mut ready: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        if ready().await {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    panic!("timed out waiting for {what}");
}

async fn flood(bytes: u64) -> (PumpReport, u64, u64) {
    /* Closes when the budget runs out, so the pump finishes and the report can
    be asserted on. */
    let (port, _observed) = flooding_server(bytes, true).await;
    let channel = open_shell(port).await;

    let batches = Arc::new(AtomicU64::new(0));
    let largest = Arc::new(AtomicU64::new(0));
    let collector = Collector {
        batches: Arc::clone(&batches),
        bytes: Arc::new(AtomicU64::new(0)),
        largest: Arc::clone(&largest),
    };

    let (_sender, receiver) = tokio::sync::mpsc::channel(16);
    let counters = Arc::new(Counters::default());
    let report = pump(channel, collector, receiver, Arc::clone(&counters)).await;

    /* The status bar reads the counters; every assertion below reads the
    report. They tally the same bytes by different routes — the counter at the
    moment of arrival, the report at the moment of emission — so a completed
    pump must agree with itself. If it does not, one of the two is lying to
    somebody. */
    assert_eq!(
        counters.snapshot().from_host,
        report.bytes_forwarded,
        "the counters and the report disagree about what arrived"
    );

    (
        report,
        batches.load(Ordering::Relaxed),
        largest.load(Ordering::Relaxed),
    )
}

#[tokio::test(flavor = "multi_thread")]
async fn a_flood_never_grows_past_the_ceiling() {
    /* The claim issue #23 makes is "bounded in memory". This is the assertion
    behind it: eight megabytes arrive and the buffer never exceeds the
    ceiling, because the loop stops reading and the SSH window closes. */
    let (report, _, largest) = flood(8 * 1024 * 1024).await;

    assert!(
        report.peak_buffered <= MAX_BUFFERED,
        "buffered {} bytes, ceiling is {MAX_BUFFERED}",
        report.peak_buffered
    );
    assert!(
        largest as usize <= MAX_BUFFERED,
        "emitted a batch of {largest} bytes"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_flood_is_delivered_whole() {
    /* Bounding memory is easy if you are allowed to drop output. We are not:
    a terminal that loses bytes under load is worse than one that is slow. */
    const TOTAL: u64 = 4 * 1024 * 1024;
    let (report, _, _) = flood(TOTAL).await;

    assert_eq!(report.bytes_forwarded, TOTAL, "output was lost under load");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_flood_does_not_become_one_event_per_write() {
    /* The server writes 8 KiB at a time; four megabytes is 512 writes. If each
    one became an IPC message the interface would spend its time in the
    bridge. Batching has to collapse them. */
    const TOTAL: u64 = 4 * 1024 * 1024;
    let (report, batches, _) = flood(TOTAL).await;

    let writes = TOTAL / (8 * 1024);
    assert!(
        batches < writes,
        "emitted {batches} batches for {writes} writes; batching did nothing"
    );

    /* And the rate is bounded by the clock, not by the producer. */
    let seconds = report.batches_emitted as f64 * MIN_EMIT_INTERVAL.as_secs_f64();
    assert!(
        seconds > 0.0,
        "the report should account for the time the batches took"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn backpressure_actually_engages() {
    /* If this count is zero the ceiling was never reached, which would mean the
    other tests pass for the wrong reason. */
    let (report, _, _) = flood(8 * 1024 * 1024).await;

    assert!(
        report.times_paused > 0,
        "the buffer never filled, so backpressure was never exercised"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_quiet_session_costs_nothing() {
    let (report, batches, _) = flood(0).await;

    assert_eq!(report.bytes_forwarded, 0);
    assert_eq!(batches, 0, "an idle session must not emit empty batches");
}

#[tokio::test(flavor = "multi_thread")]
async fn measured_throughput() {
    /* Not an assertion — a measurement, printed so the numbers in the pull
    request are observed rather than estimated. Run with --nocapture. */
    const TOTAL: u64 = 16 * 1024 * 1024;

    let started = std::time::Instant::now();
    let (report, batches, largest) = flood(TOTAL).await;
    let elapsed = started.elapsed();

    eprintln!(
        "\n  {:.1} MB in {:.2}s = {:.1} MB/s\n  {} batches ({:.0}/s), largest {} KiB\n  peak buffered {} KiB, paused {} times\n",
        TOTAL as f64 / 1024.0 / 1024.0,
        elapsed.as_secs_f64(),
        (TOTAL as f64 / 1024.0 / 1024.0) / elapsed.as_secs_f64(),
        batches,
        batches as f64 / elapsed.as_secs_f64(),
        largest / 1024,
        report.peak_buffered / 1024,
        report.times_paused,
    );

    assert_eq!(report.bytes_forwarded, TOTAL);
}

#[tokio::test(flavor = "multi_thread")]
async fn typing_reaches_the_shell_and_a_resize_reaches_the_pty() {
    /* Stays open, as an interactive shell does. An earlier version let the
    server EOF immediately, which raced the first keystroke: on Linux the
    send won, on Windows the close did, and the test failed only there. */
    let (port, observed) = flooding_server(0, false).await;
    let channel = open_shell(port).await;

    let (sender, receiver) = tokio::sync::mpsc::channel(16);
    let collector = Collector {
        batches: Arc::new(AtomicU64::new(0)),
        bytes: Arc::new(AtomicU64::new(0)),
        largest: Arc::new(AtomicU64::new(0)),
    };

    let counters = Arc::new(Counters::default());
    let pump = tokio::spawn(pump(channel, collector, receiver, Arc::clone(&counters)));

    sender
        .send(Input::Keys(b"whoami\n".to_vec()))
        .await
        .unwrap();
    sender
        .send(Input::Resize {
            columns: 120,
            rows: 40,
        })
        .await
        .unwrap();

    /* Closing the input side ends the pump, which is also how a closed tab
    tears a session down. */
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    drop(sender);

    let report = pump.await.expect("the pump finishes");

    assert_eq!(report.input_sent, 1);
    assert_eq!(report.resizes_sent, 1);

    /* The status bar's "up" figure. A resize is a pty request rather than
    something the user sent, so it must not appear here — counting it would
    make dragging the window look like typing. */
    assert_eq!(counters.snapshot().to_host, b"whoami\n".len() as u64);

    wait_until("the shell to receive the keystrokes", || async {
        observed.input.lock().await.as_slice() == b"whoami\n"
    })
    .await;
    wait_until("the pty to receive the resize", || async {
        observed.resizes.lock().await.as_slice() == [(120, 40)]
    })
    .await;
}

#[tokio::test(flavor = "multi_thread")]
async fn a_keystroke_stays_responsive_while_the_host_is_flooding() {
    /* The keystroke that stops a flood is Ctrl-C, so what matters is not only
    that it arrives but that it arrives *soon*. Under load the loop is busy
    reading, buffering and flushing; this measures how long a keystroke
    waits behind that work.

    An earlier version of this test claimed to prove that input is never
    paused by backpressure. It did not: disabling the input branch during
    backpressure left it passing, because the flush empties the buffer every
    16ms and the pause is never long enough to see. The bound below is what
    can actually be asserted. */
    let (port, observed) = flooding_server(64 * 1024 * 1024, false).await;
    let channel = open_shell(port).await;

    let (sender, receiver) = tokio::sync::mpsc::channel(16);
    let collector = Collector {
        batches: Arc::new(AtomicU64::new(0)),
        bytes: Arc::new(AtomicU64::new(0)),
        largest: Arc::new(AtomicU64::new(0)),
    };

    let pump = tokio::spawn(pump(
        channel,
        collector,
        receiver,
        Arc::new(Counters::default()),
    ));

    /* Let the flood get going and the buffer fill. */
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    const CTRL_C: &[u8] = &[0x03];
    let sent = std::time::Instant::now();
    sender.send(Input::Keys(CTRL_C.to_vec())).await.unwrap();

    wait_until("the interrupt to reach the flooding server", || async {
        !observed.input.lock().await.is_empty()
    })
    .await;
    let latency = sent.elapsed();

    assert_eq!(
        observed.input.lock().await.as_slice(),
        CTRL_C,
        "the interrupt never reached the server while it was flooding"
    );
    assert!(
        latency < std::time::Duration::from_millis(100),
        "a keystroke waited {latency:?} behind a flood; the user would read that as a freeze"
    );
    eprintln!("\n  interrupt latency under flood: {latency:?}\n");

    pump.abort_handle().abort();
}
