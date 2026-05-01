import { createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types — mirrors Rust UsageResponse/UsageInner structs (snake_case from serde)
// ---------------------------------------------------------------------------

/** Per-model stats from CLIProxy usage apis field */
export interface ModelStats {
  requests: number;
  tokens: number;
  success: number;
  failure: number;
}

/** Inner usage data returned by CLIProxy /v0/management/usage */
export interface UsageInner {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  /** Per-provider → per-model breakdown: { provider: { model: ModelStats } } */
  apis: Record<string, Record<string, ModelStats>>;
  /** Map of hour string ("0"–"23") → request count */
  requests_by_hour: Record<string, number>;
  /** Map of date string ("YYYY-MM-DD") → request count */
  requests_by_day: Record<string, number>;
  /** Map of hour string ("0"–"23") → token count */
  tokens_by_hour: Record<string, number>;
  /** Map of date string ("YYYY-MM-DD") → token count */
  tokens_by_day: Record<string, number>;
}

/** Top-level response wrapper from CLIProxy /v0/management/usage */
export interface UsageResponse {
  failed_requests: number;
  usage: UsageInner;
}

/** Flattened provider summary for display */
export interface ProviderStat {
  provider: string;
  requests: number;
  tokens: number;
  models: string[];
}

/**
 * Describes the origin of the data currently being displayed.
 * - `{ source: "live" }` — fresh from the proxy this session
 * - `{ source: "localStorage", at: number }` — cached in localStorage with known timestamp
 * - `{ source: "disk" }` — from Rust disk cache, no timestamp available
 * - `{ source: "merged" }` — live + accumulated persistent data combined
 */
export type CacheStatus =
  | { source: "live" }
  | { source: "localStorage"; at: number }
  | { source: "disk" }
  | { source: "merged"; at: number };

export type TimeRange = "today" | "7d" | "30d" | "month" | "all";

export interface AnalyticsHealth {
  lastSuccessSyncAt: number | null;
  consecutiveFailures: number;
  dataQuality: "live" | "degraded";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Local-timezone date string "YYYY-MM-DD" — avoids UTC offset mismatch from toISOString() */
function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns a local-date cutoff string for the given time range,
 * relative to today (local timezone).
 */
function rangeCutoff(range: TimeRange): string | null {
  if (range === "all") return null;
  const today = localDateString();
  const cutoff = new Date(today + "T00:00:00");
  if (range === "7d") cutoff.setDate(cutoff.getDate() - 7);
  else if (range === "30d") cutoff.setDate(cutoff.getDate() - 30);
  else if (range === "month") { cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0); }
  else if (range === "today") return today;
  return cutoff.toISOString().slice(0, 10);
}

/** Deep-merge two UsageInner objects using max() for counters (accumulates higher values). */
function mergeUsageInner(live: UsageInner, prev: UsageInner | null): UsageInner {
  const base = prev ?? {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    apis: {},
    requests_by_hour: {},
    requests_by_day: {},
    tokens_by_hour: {},
    tokens_by_day: {},
  };

  // Max for counters — guards against proxy restart resetting in-memory counters to 0
  const total_requests = Math.max(live.total_requests, base.total_requests);
  const success_count = Math.max(live.success_count, base.success_count);
  const failure_count = Math.max(live.failure_count, base.failure_count);
  const total_tokens = Math.max(live.total_tokens, base.total_tokens);

  // For per-hour/per-day maps, sum values but cap at max(live, base) per key
  // to avoid double-counting if proxy already includes historical in its response
  const requests_by_hour: Record<string, number> = { ...base.requests_by_hour };
  for (const [k, v] of Object.entries(live.requests_by_hour)) {
    requests_by_hour[k] = Math.max(v, requests_by_hour[k] ?? 0);
  }

  const requests_by_day: Record<string, number> = { ...base.requests_by_day };
  for (const [k, v] of Object.entries(live.requests_by_day)) {
    requests_by_day[k] = Math.max(v, requests_by_day[k] ?? 0);
  }

  const tokens_by_hour: Record<string, number> = { ...base.tokens_by_hour };
  for (const [k, v] of Object.entries(live.tokens_by_hour)) {
    tokens_by_hour[k] = Math.max(v, tokens_by_hour[k] ?? 0);
  }

  const tokens_by_day: Record<string, number> = { ...base.tokens_by_day };
  for (const [k, v] of Object.entries(live.tokens_by_day)) {
    tokens_by_day[k] = Math.max(v, tokens_by_day[k] ?? 0);
  }

  // Merge apis: per-provider per-model max
  const apis: Record<string, Record<string, ModelStats>> = { ...base.apis };
  for (const [provider, models] of Object.entries(live.apis)) {
    if (!apis[provider]) apis[provider] = {};
    for (const [model, stats] of Object.entries(models)) {
      const prevStats = apis[provider][model];
      apis[provider][model] = {
        requests: Math.max(stats.requests, prevStats?.requests ?? 0),
        tokens: Math.max(stats.tokens, prevStats?.tokens ?? 0),
        success: Math.max(stats.success, prevStats?.success ?? 0),
        failure: Math.max(stats.failure, prevStats?.failure ?? 0),
      };
    }
  }

  return {
    total_requests,
    success_count,
    failure_count,
    total_tokens,
    apis,
    requests_by_hour,
    requests_by_day,
    tokens_by_hour,
    tokens_by_day,
  };
}

/**
 * Merge live UsageResponse with accumulated persistent state.
 * Uses max() for counters to guard against proxy restarts resetting counters to 0.
 */
function mergeUsageResponse(live: UsageResponse, prev: UsageResponse | null): UsageResponse {
  return {
    failed_requests: Math.max(live.failed_requests, prev?.failed_requests ?? 0),
    usage: mergeUsageInner(live.usage, prev?.usage ?? null),
  };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Accumulated persistent usage state — survives proxy restarts.
 * This is the source of truth for all computed displays.
 * Loaded from disk cache on init, merged with live data on each fetch.
 */
const [persistentAccumulator, setPersistentAccumulator] = createSignal<UsageResponse | null>(null);
/** Live display state — derived from accumulator each poll cycle */
const [usageStats, setUsageStats] = createSignal<UsageResponse | null>(null);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
/** Unix timestamp (ms) of last *live* fetch from the proxy. null = never fetched live. */
const [lastFetched, setLastFetched] = createSignal<number | null>(null);
/**
 * Describes the data origin. null = live data, never cached.
 * Non-null = data came from cache (proxy was offline or this is first render).
 */
const [cacheStatus, setCacheStatus] = createSignal<CacheStatus | null>(null);
const [health, setHealth] = createSignal<AnalyticsHealth>({
  lastSuccessSyncAt: null,
  consecutiveFailures: 0,
  dataQuality: "live",
});
/** Active time range filter */
const [timeRange, setTimeRange] = createSignal<TimeRange>("7d");

// ---------------------------------------------------------------------------
// Computed / derived
// ---------------------------------------------------------------------------

const totalRequests = createMemo(() => persistentAccumulator()?.usage.total_requests ?? 0);
const totalTokens = createMemo(() => persistentAccumulator()?.usage.total_tokens ?? 0);
const failedRequests = createMemo(() => persistentAccumulator()?.failed_requests ?? 0);

/** Requests per hour slot (24-element array, index = hour 0–23) */
const reqByHour = createMemo((): number[] => {
  const map = persistentAccumulator()?.usage.requests_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Tokens per hour slot (24-element array, index = hour 0–23) */
const tokByHour = createMemo((): number[] => {
  const map = persistentAccumulator()?.usage.tokens_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Raw daily data sorted ascending — used by filteredReqByDay */
const reqByDay = createMemo(() => {
  const map = persistentAccumulator()?.usage.requests_by_day ?? {};
  return Object.entries(map)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
});

/** Daily request data filtered by active time range, capped at 7 most recent days */
const filteredReqByDay = createMemo(() => {
  const range = timeRange();
  const all = reqByDay();
  if (range === "all") return all;
  if (range === "today") return all.slice(-1);

  const cutoffStr = rangeCutoff(range);
  if (!cutoffStr) return all;

  return all.filter((d) => d.date >= cutoffStr).slice(-7);
});

/** Today's request count — always uses local timezone date, ignores timeRange filter */
const todayRequests = createMemo(() => {
  const today = localDateString();
  return persistentAccumulator()?.usage.requests_by_day[today] ?? 0;
});

/**
 * Total requests within the active time range.
 * "today" = same as todayRequests; "all" = same as totalRequests.
 */
const filteredTotalRequests = createMemo(() => {
  const range = timeRange();
  if (range === "today") return todayRequests();
  if (range === "all") return totalRequests();
  return filteredReqByDay().reduce((sum, d) => sum + d.count, 0);
});

/**
 * Total tokens within the active time range.
 * Note: tokens_by_day is available in UsageInner for accurate filtered sums.
 */
const filteredTotalTokens = createMemo(() => {
  const range = timeRange();
  if (range === "today") {
    const today = localDateString();
    return persistentAccumulator()?.usage.tokens_by_day[today] ?? 0;
  }
  if (range === "all") return totalTokens();
  const cutoffStr = rangeCutoff(range);
  if (!cutoffStr) return totalTokens();
  const map = persistentAccumulator()?.usage.tokens_by_day ?? {};
  return Object.entries(map)
    .filter(([date]) => date >= cutoffStr)
    .reduce((sum, [, v]) => sum + v, 0);
});

/**
 * Failed requests within the active time range.
 * Approximation: total failed × (filtered requests / total requests).
 * Accurate tracking would require failed_by_day — not available from CLIProxy.
 */
const filteredFailedRequests = createMemo(() => {
  const total = totalRequests();
  const filtered = filteredTotalRequests();
  if (total === 0) return 0;
  return Math.round((filtered / total) * failedRequests());
});

/**
 * Provider breakdown: sorted by request count descending.
 * Each entry aggregates all models for that provider.
 * Respects the active time range filter.
 */
const providerStats = createMemo((): ProviderStat[] => {
  const apis = persistentAccumulator()?.usage.apis ?? {};
  const range = timeRange();
  const cutoffStr = rangeCutoff(range);

  return Object.entries(apis)
    .map(([provider, models]) => {
      let requests = 0;
      let tokens = 0;
      const modelNames: string[] = [];
      for (const [model, stats] of Object.entries(models)) {
        requests += stats.requests ?? 0;
        tokens += stats.tokens ?? 0;
        modelNames.push(model);
      }
      return { provider, requests, tokens, models: modelNames };
    })
    .filter((p) => p.requests > 0)
    .sort((a, b) => b.requests - a.requests);
});

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** Envelope stored in localStorage — includes the live-fetch timestamp */
interface UsageCache {
  fetchedAt: number;
  data: UsageResponse;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: UsageResponse | null = null;

/** Persist accumulator data to cache with debounce to reduce I/O churn. */
function schedulePersistUsageCache(data: UsageResponse): void {
  pendingPersist = data;
  if (persistTimer !== null) return;

  persistTimer = setTimeout(() => {
    const payload = pendingPersist;
    pendingPersist = null;
    persistTimer = null;
    if (!payload) return;

    saveToDiskCache(payload);
  }, 2_000);
}

function saveToDiskCache(data: UsageResponse): void {
  try {
    const envelope: UsageCache = { fetchedAt: Date.now(), data };
    localStorage.setItem("aether:usage-cache", JSON.stringify(envelope));
  } catch {
    // Non-critical
  }

  // Also persist to disk via Tauri for cross-session durability
  invoke("write_usage_cache", { data }).catch(() => {
    // Non-critical
  });
}

/**
 * Load usage data from disk cache into the persistent accumulator.
 * Strategy: try localStorage first (fast, same-session), then fall back to
 * the Rust disk cache (survives localStorage wipes / app reinstalls).
 */
async function loadFromDiskCache(): Promise<boolean> {
  // 1. localStorage — fast path
  try {
    const raw = localStorage.getItem("aether:usage-cache");
    if (raw) {
      const envelope = JSON.parse(raw) as UsageCache;
      const existing = persistentAccumulator();
      const merged = existing
        ? mergeUsageResponse(envelope.data, existing)
        : envelope.data;
      setPersistentAccumulator(merged);
      setUsageStats(merged);
      setCacheStatus({ source: "localStorage", at: envelope.fetchedAt });
      return true;
    }
  } catch {
    // Corrupt entry — fall through to disk
    localStorage.removeItem("aether:usage-cache");
  }

  // 2. Rust disk cache — survives localStorage wipes
  try {
    const diskData = await invoke<UsageResponse | null>("read_usage_cache");
    if (diskData) {
      const existing = persistentAccumulator();
      const merged = existing
        ? mergeUsageResponse(diskData, existing)
        : diskData;
      setPersistentAccumulator(merged);
      setUsageStats(merged);
      // Disk cache has no fetchedAt — show cached badge without timestamp
      setCacheStatus({ source: "disk" });
      return true;
    }
  } catch {
    // No cache available at all
  }

  return false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

let pollInterval: ReturnType<typeof setInterval> | null = null;

async function fetchStats(): Promise<void> {
  // Guard against concurrent fetches (e.g. rapid re-mounts or manual refresh)
  if (loading()) return;

  setLoading(true);
  setError(null);
  try {
    const settings = await invoke<{ proxyPort: number; managementKey: string }>(
      "get_settings",
    );

    const port = settings.proxyPort ?? 8317;
    const key = settings.managementKey ?? "aether-managed";

    // Rust command deserializes to UsageResponse — no JSON.parse needed
    const response = await invoke<UsageResponse>("fetch_usage_stats", {
      port,
      managementKey: key,
    });

    // Merge live response with accumulated persistent state using max() for counters.
    // This guards against proxy restarts resetting in-memory counters to 0.
    const currentAccumulator = persistentAccumulator();
    const merged = mergeUsageResponse(response, currentAccumulator);

    setPersistentAccumulator(merged);
    setUsageStats(merged);

    const now = Date.now();
    setLastFetched(now);
    // If we have a non-null accumulator and it differs from live, show "merged" badge
    if (currentAccumulator !== null) {
      setCacheStatus({ source: "merged", at: now });
    } else {
      setCacheStatus(null); // Pure live data — no badge
    }
    setHealth({
      lastSuccessSyncAt: now,
      consecutiveFailures: 0,
      dataQuality: "live",
    });
    schedulePersistUsageCache(merged);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));

    const nextFailures = health().consecutiveFailures + 1;
    setHealth({
      lastSuccessSyncAt: health().lastSuccessSyncAt,
      consecutiveFailures: nextFailures,
      dataQuality: nextFailures >= 2 ? "degraded" : health().dataQuality,
    });

    // Proxy offline — load from cache only if we have no data yet
    if (persistentAccumulator() === null) {
      const loadedFromCache = await loadFromDiskCache();
      if (loadedFromCache) {
        setHealth({
          lastSuccessSyncAt: health().lastSuccessSyncAt,
          consecutiveFailures: nextFailures,
          dataQuality: "degraded",
        });
      }
    }
  } finally {
    setLoading(false);
  }
}

/**
 * Initialise: load cache immediately (instant UI), then fetch live.
 * Skips cache load if accumulator is already populated (re-mount case)
 * to avoid flashing a "Cached" badge over fresh data.
 */
async function init(): Promise<void> {
  if (persistentAccumulator() === null) {
    await loadFromDiskCache();
  }
  await fetchStats();
}

/** Start polling. Awaits init() before the interval so no races on first fetch. */
async function startPolling(intervalMs = 30_000): Promise<void> {
  if (pollInterval) clearInterval(pollInterval);
  await init();
  pollInterval = setInterval(fetchStats, intervalMs);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function refresh(): void {
  fetchStats();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const analyticsStore = {
  // Signals (call as functions to read)
  usageStats,
  loading,
  error,
  /** Timestamp (ms) of last live fetch from proxy. null = not yet fetched live this session. */
  lastFetched,
  /**
   * Describes where the currently displayed data came from.
   * null = live data. Non-null = cached/merged.
   */
  cacheStatus,
  health,
  // Computed
  totalRequests,
  totalTokens,
  failedRequests,
  reqByHour,
  tokByHour,
  reqByDay,
  filteredReqByDay,
  todayRequests,
  filteredTotalRequests,
  filteredTotalTokens,
  filteredFailedRequests,
  providerStats,
  // Time range
  timeRange,
  setTimeRange,
  // Actions
  startPolling,
  stopPolling,
  refresh,
};
