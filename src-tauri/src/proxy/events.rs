use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Emitter;
use tokio::sync::oneshot;

/// Guards the active event-stream abort sender so only one stream runs at a time.
/// `std::sync::Mutex` is used intentionally — the lock is held only for a pointer
/// swap (no `.await` while holding it), so there is no async deadlock risk.
/// We `.expect()` on lock/unlock so a panic-poisoned mutex surfaces loudly.
static STREAM_ABORT: Mutex<Option<oneshot::Sender<()>>> = Mutex::new(None);

/// A proxied API request event from the sidecar's WebSocket stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEvent {
    pub id: String,
    pub timestamp: String,
    pub method: String,
    pub endpoint: String,
    pub provider: String,
    #[serde(default)]
    pub status_code: Option<u16>,
    #[serde(default)]
    pub latency_ms: Option<u64>,
    #[serde(default)]
    pub tokens_used: Option<u64>,
    #[serde(default)]
    pub request_headers: Option<serde_json::Value>,
    #[serde(default)]
    pub request_body: Option<String>,
    #[serde(default)]
    pub response_headers: Option<serde_json::Value>,
    #[serde(default)]
    pub response_body: Option<String>,
    /// Whether the request is still in-flight
    #[serde(default)]
    pub in_flight: bool,
}

/// Status of the WebSocket event stream connection.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventStreamStatus {
    pub connected: bool,
    pub error: Option<String>,
}

/// Connect to the sidecar's WebSocket event stream and relay events to the frontend.
/// Cancels any previously running stream before starting a new one.
/// The abort sender is stored in `STREAM_ABORT` *before* the task is spawned
/// to prevent a race window where a second call could fail to cancel the first.
pub fn start_event_stream(app: tauri::AppHandle, port: u16) {
    let (abort_tx, mut abort_rx) = oneshot::channel::<()>();

    // Store abort_tx BEFORE spawning so a concurrent call that immediately
    // follows will find and cancel this stream — not an old stale sender.
    {
        let mut guard = STREAM_ABORT.lock().expect("STREAM_ABORT mutex poisoned");
        if let Some(prev) = guard.take() {
            let _ = prev.send(()); // signal previous stream to stop
        }
        *guard = Some(abort_tx);
    }

    tauri::async_runtime::spawn(async move {
        // Use 127.0.0.1 explicitly — avoids macOS IPv6/IPv4 resolution ambiguity
        let url = format!("ws://127.0.0.1:{}/v1/ws", port);
        log::info!("Connecting to sidecar event stream: {}", url);

        app.emit(
            "event-stream-status",
            EventStreamStatus {
                connected: false,
                error: None,
            },
        )
        .ok();

        // Try to connect — bail early if cancelled before connection is established
        let ws_result = tokio::select! {
            result = connect_ws(&url) => result,
            _ = &mut abort_rx => {
                log::info!("Event stream aborted before connection");
                return;
            }
        };

        match ws_result {
            Ok(ws_stream) => {
                app.emit(
                    "event-stream-status",
                    EventStreamStatus {
                        connected: true,
                        error: None,
                    },
                )
                .ok();

                let (_, mut read) = ws_stream.split();

                let mut loop_rx = abort_rx;

                loop {
                    tokio::select! {
                        biased; // check abort first to exit promptly
                        _ = &mut loop_rx => {
                            log::info!("Event stream read loop aborted");
                            break;
                        }
                        msg = read.next() => {
                            match msg {
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                    match serde_json::from_str::<RequestEvent>(&text) {
                                        Ok(event) => {
                                            app.emit("proxy-request", &event).ok();
                                        }
                                        Err(e) => {
                                            log::warn!("Failed to parse request event: {}", e);
                                        }
                                    }
                                }
                                Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) => {
                                    log::info!("WebSocket closed by server");
                                    break;
                                }
                                Some(Ok(_)) => {} // ignore ping/pong/binary
                                Some(Err(e)) => {
                                    log::warn!("WebSocket error: {}", e);
                                    break;
                                }
                                None => {
                                    log::info!("WebSocket stream ended");
                                    break;
                                }
                            }
                        }
                    }
                }

                app.emit(
                    "event-stream-status",
                    EventStreamStatus {
                        connected: false,
                        error: None,
                    },
                )
                .ok();
            }
            Err(e) => {
                let err_msg = format!("Failed to connect to event stream: {}", e);
                log::warn!("{}", err_msg);
                app.emit(
                    "event-stream-status",
                    EventStreamStatus {
                        connected: false,
                        error: Some(err_msg),
                    },
                )
                .ok();
            }
        }
    });
}

async fn connect_ws(
    url: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    tokio_tungstenite::tungstenite::Error,
> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(url).await?;
    Ok(ws_stream)
}
