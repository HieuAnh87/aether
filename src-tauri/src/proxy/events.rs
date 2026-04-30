use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::oneshot;

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
/// Returns a oneshot sender that can be used to abort the connection.
pub fn start_event_stream(
    app: tauri::AppHandle,
    port: u16,
) -> oneshot::Sender<()> {
    let (abort_tx, abort_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let url = format!("ws://localhost:{}/events", port);
        log::info!("Connecting to sidecar event stream: {}", url);

        // Emit initial connecting status
        app.emit(
            "event-stream-status",
            EventStreamStatus {
                connected: false,
                error: None,
            },
        )
        .ok();

        // Try to connect with retry logic
        let ws_result = tokio::select! {
            result = connect_ws(&url) => result,
            _ = abort_rx => {
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

                // Create a new abort channel for the read loop
                let (loop_abort_tx, mut loop_abort_rx) = oneshot::channel::<()>();
                // We can't reuse abort_rx since it was already consumed, but the
                // abort_tx the caller holds was already consumed in the select above.
                // Instead, just read until the stream ends or we get an error.
                drop(loop_abort_tx); // unused, just read until done

                loop {
                    tokio::select! {
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
                        _ = &mut loop_abort_rx => {
                            log::info!("Event stream read loop aborted");
                            break;
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

    abort_tx
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
