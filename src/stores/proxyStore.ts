import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ProxyStatus = "running" | "stopped" | "starting" | "restarting" | "crashed";

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

async function init() {
  try {
    const event = await invoke<ProxyStatusEvent>("get_proxy_status");
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
}

// Call init immediately (module-level)
init();

// Actions
async function startProxy(customPort?: number) {
  setLoading(true);
  try {
    await invoke("start_proxy", { port: customPort ?? port() });
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
    await invoke("stop_proxy");
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
    await invoke("restart_proxy", { port: customPort ?? port() });
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
