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
 */
export type CacheStatus =
  | { source: "live" }
  | { source: "localStorage"; at: number }
  | { source: "disk" };

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

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Computed / derived
// ---------------------------------------------------------------------------

const totalRequests = createMemo(() => usageStats()?.usage.total_requests ?? 0);
const totalTokens = createMemo(() => usageStats()?.usage.total_tokens ?? 0);
const failedRequests = createMemo(() => usageStats()?.failed_requests ?? 0);

/** Requests per hour slot (24-element array, index = hour 0–23) */
const reqByHour = createMemo((): number[] => {
  const map = usageStats()?.usage.requests_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Tokens per hour slot (24-element array, index = hour 0–23) */
const tokByHour = createMemo((): number[] => {
  const map = usageStats()?.usage.tokens_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Last 7 days of request data as { date, count } array, sorted ascending */
const reqByDay = createMemo(() => {
  const map = usageStats()?.usage.requests_by_day ?? {};
  return Object.entries(map)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
});

/** Today's request count using local timezone date to match server date strings */
const todayRequests = createMemo(() => {
  const today = localDateString();
  return usageStats()?.usage.requests_by_day[today] ?? 0;
});

/**
 * Provider breakdown: sorted by request count descending.
 * Each entry aggregates all models for that provider.
 */
const providerStats = createMemo((): ProviderStat[] => {
  const apis = usageStats()?.usage.apis ?? {};
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

/**
 * Load usage data from cache.
 * Strategy: try localStorage first (fast, same-session), then fall back to
 * the Rust disk cache (survives localStorage wipes / app reinstalls).
 */
async function loadFromDiskCache(): Promise<boolean> {
  // 1. localStorage — fast path
  try {
    const raw = localStorage.getItem("aether:usage-cache");
    if (raw) {
      const envelope = JSON.parse(raw) as UsageCache;
      setUsageStats(envelope.data);
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
      setUsageStats(diskData);
      // Disk cache has no fetchedAt — show cached badge without timestamp
      setCacheStatus({ source: "disk" });
      return true;
    }
  } catch {
    // No cache available at all
  }

  return false;
}

/** Persist live data to cache. Always writes — every 30s is cheap and avoids stale distributions. */
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
    const settings = await invoke<{ proxy_port: number; management_key: string }>(
      "get_settings",
    );

    const port = settings.proxy_port ?? 8317;
    const key = settings.management_key ?? "aether-managed";

    // Rust command deserializes to UsageResponse — no JSON.parse needed
    const response = await invoke<UsageResponse>("fetch_usage_stats", {
      port,
      managementKey: key,
    });

    setUsageStats(response);
    setLastFetched(Date.now());
    setCacheStatus(null); // Live data — clear cache badge
    saveToDiskCache(response);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));

    // Proxy offline — load from cache only if we have no live data yet
    if (usageStats() === null) {
      await loadFromDiskCache();
    }
  } finally {
    setLoading(false);
  }
}

/**
 * Initialise: load cache immediately (instant UI), then fetch live.
 * Skips cache load if live data is already present (re-mount case)
 * to avoid flashing a "Cached" badge over fresh data.
 */
async function init(): Promise<void> {
  if (usageStats() === null) {
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
   * null = live data. Non-null = cached (proxy was offline or first render).
   */
  cacheStatus,
  // Computed
  totalRequests,
  totalTokens,
  failedRequests,
  reqByHour,
  tokByHour,
  reqByDay,
  todayRequests,
  providerStats,
  // Actions
  startPolling,
  stopPolling,
  refresh,
};
