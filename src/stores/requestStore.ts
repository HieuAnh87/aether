import { createSignal, createMemo } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invokeCompat } from "./commandClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestEvent {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  provider: string;
  statusCode?: number;
  latencyMs?: number;
  tokensUsed?: number;
  requestHeaders?: Record<string, unknown>;
  requestBody?: string;
  responseHeaders?: Record<string, unknown>;
  responseBody?: string;
  inFlight: boolean;
}

interface EventStreamStatus {
  connected: boolean;
  error?: string;
}

export type FilterStatus = "all" | "success" | "error";

const MAX_BUFFER = 500;

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [requests, setRequests] = createSignal<RequestEvent[]>([]);
const [filterProvider, setFilterProvider] = createSignal<string | null>(null);
const [filterStatus, setFilterStatus] = createSignal<FilterStatus>("all");
const [searchQuery, setSearchQuery] = createSignal<string>("");
const [selectedRequestId, setSelectedRequestId] = createSignal<string | null>(null);
const [streamConnected, setStreamConnected] = createSignal<boolean>(false);
const [streamError, setStreamError] = createSignal<string | null>(null);

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const filteredRequests = createMemo(() => {
  let result = requests();

  const provider = filterProvider();
  if (provider !== null) {
    result = result.filter((r) => r.provider.toLowerCase() === provider.toLowerCase());
  }

  const status = filterStatus();
  if (status === "success") {
    result = result.filter((r) => r.statusCode !== undefined && r.statusCode >= 200 && r.statusCode < 300);
  } else if (status === "error") {
    result = result.filter((r) => r.statusCode !== undefined && r.statusCode >= 400);
  }

  const query = searchQuery().trim().toLowerCase();
  if (query) {
    result = result.filter((r) => {
      const haystack = [r.endpoint, r.method, r.provider, r.statusCode?.toString() ?? "", r.id]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  return result;
});

const providers = createMemo(() => {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const req of requests()) {
    const raw = req.provider?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(raw);
  }

  return ordered;
});

const selectedRequest = createMemo(() => {
  const id = selectedRequestId();
  if (!id) return null;
  return requests().find((r) => r.id === id) ?? null;
});

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

let unlistenRequest: UnlistenFn | null = null;
let unlistenStream: UnlistenFn | null = null;

async function init() {
  // Listen for proxy-request events
  unlistenRequest = await listen<RequestEvent>("proxy-request", (event) => {
    setRequests((prev) => {
      const existing = prev.findIndex((r) => r.id === event.payload.id);
      let updated: RequestEvent[];
      if (existing !== -1) {
        // Update in-flight request with completed data
        updated = prev.map((r, i) => (i === existing ? event.payload : r));
      } else {
        // Add to front, trim to max buffer size
        updated = [event.payload, ...prev].slice(0, MAX_BUFFER);
      }
      return updated;
    });
  });

  // Listen for event-stream-status events
  unlistenStream = await listen<EventStreamStatus>("event-stream-status", (event) => {
    setStreamConnected(event.payload.connected);
    setStreamError(event.payload.error ?? null);
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function selectRequest(id: string | null) {
  setSelectedRequestId(id);
}

function clearRequests() {
  setRequests([]);
  setSelectedRequestId(null);
}

async function startStream() {
  try {
    setStreamError(null);
    setStreamConnected(false);
    await invokeCompat<void>("start_event_stream");
  } catch (e) {
    setStreamConnected(false);
    setStreamError(String(e));
  }
}

function cleanup() {
  if (unlistenRequest) {
    unlistenRequest();
    unlistenRequest = null;
  }
  if (unlistenStream) {
    unlistenStream();
    unlistenStream = null;
  }
}

// Initialize listeners at module level
init();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const requestStore = {
  // Signals
  requests,
  filterProvider,
  filterStatus,
  searchQuery,
  selectedRequestId,
  streamConnected,
  streamError,
  // Computed
  filteredRequests,
  providers,
  selectedRequest,
  // Actions
  setFilterProvider,
  setFilterStatus,
  setSearchQuery,
  selectRequest,
  clearRequests,
  startStream,
  cleanup,
  init,
};
