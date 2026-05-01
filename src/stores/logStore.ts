import { createSignal, createMemo } from "solid-js";
import { attachLogger } from "@tauri-apps/plugin-log";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  id: string;
  ts: number;
  level: number; // 1=Trace, 2=Debug, 3=Info, 4=Warn, 5=Error
  source: string;
  message: string;
}

export type LogFilter = "warn" | "all";

// Level constants (matches @tauri-apps/plugin-log LogLevel enum)
const LEVEL_TRACE = 1;
const LEVEL_DEBUG = 2;
const LEVEL_INFO = 3;
const LEVEL_WARN = 4;
const LEVEL_ERROR = 5;

const MAX_BUFFER = 1000;

// ---------------------------------------------------------------------------
// tauri-plugin-log message format parser
//
// The Webview target forwards the fully-formatted fern string, e.g.:
//   "[2026-05-01][11:12:01][app_lib::proxy::events][WARN] Failed to connect..."
//
// We parse it to:
//   1. Extract a clean message (strip the prefix)
//   2. Derive source from the Rust module path
//   3. Deduplicate events that are already covered by structured Tauri events
// ---------------------------------------------------------------------------

// Modules whose warn/error logs are already emitted as structured Tauri events.
// Entries from these modules are dropped from log://log to avoid duplicates.
const DEDUPE_MODULES = new Set([
  "app_lib::proxy::events", // covered by "event-stream-status"
]);

// ---------------------------------------------------------------------------
// Fern format parser (Rust log framework)
//
// tauri-plugin-log Webview target forwards the fully-formatted fern string:
//   "[2026-05-01][11:12:01][app_lib::proxy][INFO] some message here"
// ---------------------------------------------------------------------------

const FERN_RE =
  /^\[\d{4}-\d{2}-\d{2}\]\[\d{2}:\d{2}:\d{2}\]\[([^\]]+)\]\[(?:TRACE|DEBUG|INFO|WARN|ERROR)\] ([\s\S]*)$/;

interface ParsedLog {
  module: string;
  message: string;
}

function parseFernMessage(raw: string): ParsedLog | null {
  const m = FERN_RE.exec(raw.trim());
  if (!m) return null;
  return { module: m[1], message: m[2].trim() };
}

// ---------------------------------------------------------------------------
// Go sidecar (CLIProxyAPI) log parser
//
// CLIProxyAPI uses logrus with a custom LogFormatter. ALL stdout lines have:
//   [YYYY-MM-DD HH:MM:SS] [reqid|--------] [level] [file.go:line] message
//
// Examples:
//   [2026-05-01 20:21:14] [--------] [info ] [main.go:428] CLIProxyAPI Version: 6.9.45
//   [2026-05-01 20:21:14] [a1b2c3d4] [warn ] [gin_logger.go:98] 400 | 55ms | ::1 | PUT "/v0/..."
//
// HTTP request lines (gin_logger.go): STATUS | LATENCY | IP | METHOD "PATH"
//   >= 500 → error, >= 400 → warn, < 400 → info
// ---------------------------------------------------------------------------

const GO_LOG_RE =
  /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[(?:[a-f0-9]{8}|-{8})\] \[(info |warn |error|debug|trace|fatal)\] \[([^\]]+)\] ([\s\S]+)$/;

const GO_LEVEL_MAP: Record<string, number> = {
  trace: LEVEL_TRACE,
  debug: LEVEL_DEBUG,
  info: LEVEL_INFO,
  warn: LEVEL_WARN,
  error: LEVEL_ERROR,
  fatal: LEVEL_ERROR,
};

// Health-check polling: GET "/" from gin_logger — drop silently.
// Gin uses fixed-width columns with extra padding, e.g.:
//   " 200 |       0s |       ::1        | GET    "/"  "
const GO_HEALTHCHECK_RE = /^\s*200\s*\|.*\|\s*GET\s+"\/"\s*$/;

// Go messages that duplicate Rust-level logs (already emitted by proxy module).
// The Rust proxy code parses certain stdout lines and re-emits them as clean messages,
// then the raw Go logrus line arrives separately — drop the Go duplicate.
const GO_DEDUP_PATTERNS: RegExp[] = [
  /^CLIProxyAPI Version:/,                    // already reported by proxy as "CLIProxyAPI Version: ..."
  /^full client load complete/,               // already reported by proxy as "server clients and configuration updated: ..."
];

interface ParsedGoLog {
  level: number;
  message: string;
}

function parseGoMessage(raw: string): ParsedGoLog | null {
  const m = GO_LOG_RE.exec(raw.trim());
  if (!m) return null;
  const level = GO_LEVEL_MAP[m[1].trimEnd()] ?? LEVEL_INFO;
  return { level, message: m[3].trim() };
}

// ---------------------------------------------------------------------------
// Source derivation
// ---------------------------------------------------------------------------

/** Derive a short human-readable source tag from a Rust module path */
function moduleToSource(mod: string): string {
  if (mod.includes("proxy::events")) return "stream";
  if (mod.includes("proxy")) return "proxy";
  if (mod.includes("config") || mod.includes("watcher")) return "config";
  if (mod.includes("keychain")) return "keychain";
  return "app";
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

let _idCounter = 0;
function nextId(): string {
  return `log-${Date.now()}-${++_idCounter}`;
}

const [logs, setLogs] = createSignal<LogEntry[]>([]);
const [logFilter, setLogFilter] = createSignal<LogFilter>("warn");
const [searchQuery, setSearchQuery] = createSignal("");
const [paused, setPaused] = createSignal(false);

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const filteredLogs = createMemo(() => {
  let result = logs();

  // Level filter
  if (logFilter() !== "all") {
    result = result.filter((e) => e.level >= LEVEL_WARN);
  }

  // Search filter
  const q = searchQuery().trim().toLowerCase();
  if (q) {
    result = result.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q),
    );
  }

  return result;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushEntry(entry: Omit<LogEntry, "id" | "ts">) {
  setLogs((prev) => {
    const next = [...prev, { ...entry, id: nextId(), ts: Date.now() }];
    return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
  });
}

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

interface ProxyStatusEvent {
  status: string;
  port?: number;
  error?: string;
}

interface EventStreamStatus {
  connected: boolean;
  error?: string;
}

let detachLogger: UnlistenFn | null = null;
let unlistenProxyStatus: UnlistenFn | null = null;
let unlistenStreamStatus: UnlistenFn | null = null;
let unlistenConfigChanged: UnlistenFn | null = null;

async function init() {
  if (detachLogger) return; // already initialized — prevent duplicate listeners

  // 1. Raw Rust logs via tauri-plugin-log Webview target ("log://log")
  //    Messages arrive fully formatted: "[date][time][module][LEVEL] text"
  //    We parse them and deduplicate against structured Tauri events.
  detachLogger = await attachLogger(({ level, message }) => {
    if (!message.trim()) return;

    const parsed = parseFernMessage(message);
    if (parsed) {
      // Drop modules already covered by structured Tauri events
      if (DEDUPE_MODULES.has(parsed.module)) return;

      const source = moduleToSource(parsed.module);

      // If from proxy module, check if the message is a Go sidecar logrus line.
      // CLIProxyAPI stdout → Rust log::info! at app_lib::proxy → arrives here.
      // Go lines have their own level (warn/error for 4xx/5xx) which we extract,
      // overriding Rust's always-info level.
      if (source === "proxy") {
        const goLog = parseGoMessage(parsed.message);
        if (goLog) {
          // Drop health-check GET "/" polling noise
          if (GO_HEALTHCHECK_RE.test(goLog.message)) return;
          // Drop Go lines that duplicate Rust-level proxy logs
          if (GO_DEDUP_PATTERNS.some((re) => re.test(goLog.message))) return;
          pushEntry({ level: goLog.level, source: "cliproxy", message: goLog.message });
          return;
        }
      }

      pushEntry({ level, source, message: parsed.message });
    } else {
      // Not fern-formatted (e.g. JS-side log calls) — keep as-is
      pushEntry({ level, source: "app", message: message.trim() });
    }
  });

  // 2. Proxy lifecycle events → structured log entries
  unlistenProxyStatus = await listen<ProxyStatusEvent>("proxy-status-changed", (event) => {
    const { status, port, error } = event.payload;
    let level: number;
    let message: string;

    switch (status) {
      case "running":
        level = LEVEL_INFO;
        message = port ? `Proxy running on port ${port}` : "Proxy running";
        break;
      case "stopped":
        level = LEVEL_INFO;
        message = "Proxy stopped";
        break;
      case "starting":
        level = LEVEL_INFO;
        message = "Proxy starting…";
        break;
      case "crashed":
        level = LEVEL_ERROR;
        message = error ? `Proxy crashed: ${error}` : "Proxy crashed unexpectedly";
        break;
      case "error":
        level = LEVEL_ERROR;
        message = error ? `Proxy error: ${error}` : "Proxy encountered an error";
        break;
      default:
        level = LEVEL_WARN;
        message = error ? `Proxy status: ${status} — ${error}` : `Proxy status: ${status}`;
    }

    pushEntry({ level, source: "proxy", message });
  });

  // 3. Event stream WebSocket status — keep structured events for clean messages.
  //    The corresponding log://log entries from app_lib::proxy::events are deduped above.
  unlistenStreamStatus = await listen<EventStreamStatus>("event-stream-status", (event) => {
    const { connected, error } = event.payload;
    if (connected) {
      pushEntry({ level: LEVEL_INFO, source: "stream", message: "Event stream connected" });
    } else if (error) {
      pushEntry({ level: LEVEL_WARN, source: "stream", message: `Stream error: ${error}` });
    } else {
      pushEntry({ level: LEVEL_INFO, source: "stream", message: "Event stream disconnected" });
    }
  });

  // 4. External config file changes
  unlistenConfigChanged = await listen<string>("config-changed", (event) => {
    const which = event.payload;
    const label = which === "slim" ? "oh-my-opencode-slim.json" : "opencode.json";
    pushEntry({ level: LEVEL_INFO, source: "config", message: `Config changed: ${label}` });
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function clearLogs() {
  setLogs([]);
}

function togglePause() {
  setPaused((p) => !p);
}

function cleanup() {
  detachLogger?.();
  detachLogger = null;
  unlistenProxyStatus?.();
  unlistenProxyStatus = null;
  unlistenStreamStatus?.();
  unlistenStreamStatus = null;
  unlistenConfigChanged?.();
  unlistenConfigChanged = null;
}

// Initialize at module load (same pattern as requestStore)
init();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const logStore = {
  // Signals
  logs,
  logFilter,
  searchQuery,
  paused,
  // Computed
  filteredLogs,
  // Actions
  setLogFilter,
  setSearchQuery,
  clearLogs,
  togglePause,
  cleanup,
  init,
};
