import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { invokeCompat } from "./commandClient";

export type ProxyStatus = "running" | "stopped" | "starting" | "stopping" | "degraded" | "crashed";

interface ProxyRuntimeLifecycleEvent {
  state: ProxyStatus;
  source: string;
  details: Record<string, unknown>;
  timestampMs: number;
}

interface ProxyStatusEvent {
  status: ProxyStatus;
  port: number;
  error: string | null;
}

// Create signals
const [status, setStatus] = createSignal<ProxyStatus>("stopped");
const [port, setPort] = createSignal<number>(8317);
const [error, setError] = createSignal<string | null>(null);
const [loading, setLoading] = createSignal(false);

// Initialize: fetch current status and listen for events
let unlisten: (() => void) | null = null;
let unlistenRuntime: (() => void) | null = null;

async function init() {
  try {
    const event = await invokeCompat<ProxyStatusEvent>("get_proxy_status");
    setStatus(event.status);
    setPort(event.port);
    setError(event.error);
  } catch {
    // Proxy state not initialized yet, keep defaults
  }

  // Listen for proxy status change events from Rust backend
  unlisten = await listen<ProxyStatusEvent>("proxy-status-changed", (event) => {
    setStatus(event.payload.status);
    setPort(event.payload.port);
    if (event.payload.error) {
      setError(event.payload.error);
    } else {
      setError(null);
    }
  });

  // Listen to v2 runtime lifecycle stream and reflect state transitions.
  unlistenRuntime = await listen<ProxyRuntimeLifecycleEvent>("proxy-runtime-lifecycle", (event) => {
    const { state, details } = event.payload;
    setStatus(state);

    const maybePort = details?.port;
    if (typeof maybePort === "number") {
      setPort(maybePort);
    }

    const maybeError = details?.error;
    if (typeof maybeError === "string" && maybeError.length > 0) {
      setError(maybeError);
    } else if (state === "running" || state === "stopped") {
      setError(null);
    }
  });
}

// Call init immediately (module-level)
init();

// Actions
async function startProxy(customPort?: number) {
  setLoading(true);
  try {
    await invokeCompat<void>("start_proxy", { port: customPort ?? port() });
  } catch (e) {
    setError(String(e));
    throw e;
  } finally {
    setLoading(false);
  }
}

async function stopProxy() {
  setLoading(true);
  try {
    await invokeCompat<void>("stop_proxy");
  } catch (e) {
    setError(String(e));
    throw e;
  } finally {
    setLoading(false);
  }
}

async function restartProxy(customPort?: number) {
  setLoading(true);
  try {
    await invokeCompat<void>("restart_proxy", { port: customPort ?? port() });
  } catch (e) {
    setError(String(e));
    throw e;
  } finally {
    setLoading(false);
  }
}

function cleanup() {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  if (unlistenRuntime) {
    unlistenRuntime();
    unlistenRuntime = null;
  }
}

export const proxyStore = {
  // Signals (read-only accessors)
  status,
  port,
  error,
  loading,
  // Actions
  startProxy,
  stopProxy,
  restartProxy,
  cleanup,
  init,
};
