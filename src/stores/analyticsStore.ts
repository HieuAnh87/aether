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

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Usage state displayed in analytics.
 * Source of truth is lifetime accumulator (survives proxy restarts).
 */
const [persistentAccumulator, setPersistentAccumulator] = createSignal<UsageResponse | null>(null);
/** Live display state — derived from accumulator each poll cycle */
const [usageStats, setUsageStats] = createSignal<UsageResponse | null>(null);
/** Lifetime accumulator — tracks totals across proxy restarts */
const [lifetimeAccumulator, setLifetimeAccumulator] = createSignal<LifetimeAccumulator | null>(null);
/** Last live snapshot — used to compute deltas */
const [lastSnapshot, setLastSnapshot] = createSignal<UsageResponse | null>(null);
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

const totalRequests = createMemo(() => lifetimeAccumulator()?.total_requests ?? 0);
const totalTokens = createMemo(() => lifetimeAccumulator()?.total_tokens ?? 0);
const failedRequests = createMemo(() => lifetimeAccumulator()?.failure_count ?? 0);

/** Requests per hour slot (24-element array, index = hour 0–23) */
const reqByHour = createMemo((): number[] => {
  const map = lifetimeAccumulator()?.requests_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Tokens per hour slot (24-element array, index = hour 0–23) */
const tokByHour = createMemo((): number[] => {
  const map = lifetimeAccumulator()?.tokens_by_hour ?? {};
  const arr = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) {
    arr[h] = map[String(h)] ?? 0;
  }
  return arr;
});

/** Raw daily data sorted ascending — used by filteredReqByDay */
const reqByDay = createMemo(() => {
  const map = lifetimeAccumulator()?.requests_by_day ?? {};
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
  return lifetimeAccumulator()?.requests_by_day[today] ?? 0;
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
 * Note: tokens_by_day is available in LifetimeAccumulator for accurate filtered sums.
 */
const filteredTotalTokens = createMemo(() => {
  const range = timeRange();
  if (range === "today") {
    const today = localDateString();
    return lifetimeAccumulator()?.tokens_by_day[today] ?? 0;
  }
  if (range === "all") return totalTokens();
  const cutoffStr = rangeCutoff(range);
  if (!cutoffStr) return totalTokens();
  const map = lifetimeAccumulator()?.tokens_by_day ?? {};
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
 * Applies time-range filtering via proportional estimation from requests_by_day.
 */
const providerStats = createMemo((): ProviderStat[] => {
  const apis = lifetimeAccumulator()?.apis ?? {};

  // Proportional factor: what fraction of total requests fall within the filtered range?
  const total = totalRequests();
  const filtered = filteredTotalRequests();
  const factor = total > 0 ? filtered / total : 0;

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
    .map((p) => ({
      ...p,
      // Apply time-range filter proportionally (estimation — no per-provider per-day data)
      requests: Math.round(p.requests * factor),
      tokens: Math.round(p.tokens * factor),
    }))
    .filter((p) => p.requests > 0)
    .sort((a, b) => b.requests - a.requests);
});

// ---------------------------------------------------------------------------
// Delta accumulation helpers
// ---------------------------------------------------------------------------

/**
 * Initialize lifetime accumulator from first live snapshot.
 */
function initLifetimeFromSnapshot(snapshot: UsageResponse): LifetimeAccumulator {
  return {
    total_requests: snapshot.usage.total_requests,
    success_count: snapshot.usage.success_count,
    failure_count: snapshot.usage.failure_count,
    total_tokens: snapshot.usage.total_tokens,
    apis: JSON.parse(JSON.stringify(snapshot.usage.apis)), // deep clone
    requests_by_hour: { ...snapshot.usage.requests_by_hour },
    requests_by_day: { ...snapshot.usage.requests_by_day },
    tokens_by_hour: { ...snapshot.usage.tokens_by_hour },
    tokens_by_day: { ...snapshot.usage.tokens_by_day },
  };
}

/**
 * Compute delta and accumulate into lifetime.
 * When live < last (proxy restart), treat as new session — reset baseline, don't subtract.
 */
function accumulateDelta(
  lifetime: LifetimeAccumulator,
  live: UsageResponse,
  last: UsageResponse | null
): LifetimeAccumulator {
  // If no previous snapshot, initialize from live
  if (!last) {
    return initLifetimeFromSnapshot(live);
  }

  const liveUsage = live.usage;
  const lastUsage = last.usage;

  // Detect proxy restart: live counters dropped below last
  const isRestart =
    liveUsage.total_requests < lastUsage.total_requests ||
    liveUsage.total_tokens < lastUsage.total_tokens;

  if (isRestart) {
    // New session — add live snapshot as-is to lifetime (don't subtract)
    return {
      total_requests: lifetime.total_requests + liveUsage.total_requests,
      success_count: lifetime.success_count + liveUsage.success_count,
      failure_count: lifetime.failure_count + liveUsage.failure_count,
      total_tokens: lifetime.total_tokens + liveUsage.total_tokens,
      apis: accumulateApis(lifetime.apis, liveUsage.apis, {}),
      requests_by_hour: accumulateMap(lifetime.requests_by_hour, liveUsage.requests_by_hour, {}),
      requests_by_day: accumulateMap(lifetime.requests_by_day, liveUsage.requests_by_day, {}),
      tokens_by_hour: accumulateMap(lifetime.tokens_by_hour, liveUsage.tokens_by_hour, {}),
      tokens_by_day: accumulateMap(lifetime.tokens_by_day, liveUsage.tokens_by_day, {}),
    };
  }

  // Normal increment — compute delta and add to lifetime
  const deltaRequests = liveUsage.total_requests - lastUsage.total_requests;
  const deltaSuccess = liveUsage.success_count - lastUsage.success_count;
  const deltaFailure = liveUsage.failure_count - lastUsage.failure_count;
  const deltaTokens = liveUsage.total_tokens - lastUsage.total_tokens;

  return {
    total_requests: lifetime.total_requests + deltaRequests,
    success_count: lifetime.success_count + deltaSuccess,
    failure_count: lifetime.failure_count + deltaFailure,
    total_tokens: lifetime.total_tokens + deltaTokens,
    apis: accumulateApis(lifetime.apis, liveUsage.apis, lastUsage.apis),
    requests_by_hour: accumulateMap(lifetime.requests_by_hour, liveUsage.requests_by_hour, lastUsage.requests_by_hour),
    requests_by_day: accumulateMap(lifetime.requests_by_day, liveUsage.requests_by_day, lastUsage.requests_by_day),
    tokens_by_hour: accumulateMap(lifetime.tokens_by_hour, liveUsage.tokens_by_hour, lastUsage.tokens_by_hour),
    tokens_by_day: accumulateMap(lifetime.tokens_by_day, liveUsage.tokens_by_day, lastUsage.tokens_by_day),
  };
}

/**
 * Accumulate per-key map via delta (live - last).
 */
function accumulateMap(
  lifetime: Record<string, number>,
  live: Record<string, number>,
  last: Record<string, number>
): Record<string, number> {
  const result = { ...lifetime };
  for (const key of Object.keys(live)) {
    const liveVal = live[key] ?? 0;
    const lastVal = last[key] ?? 0;
    const delta = liveVal - lastVal;
    result[key] = (result[key] ?? 0) + delta;
  }
  return result;
}

/**
 * Accumulate per-provider per-model apis via delta.
 */
function accumulateApis(
  lifetime: Record<string, Record<string, ModelStats>>,
  live: Record<string, Record<string, ModelStats>>,
  last: Record<string, Record<string, ModelStats>>
): Record<string, Record<string, ModelStats>> {
  const result: Record<string, Record<string, ModelStats>> = JSON.parse(JSON.stringify(lifetime));

  for (const [provider, models] of Object.entries(live)) {
    if (!result[provider]) result[provider] = {};
    for (const [model, liveStats] of Object.entries(models)) {
      const lastStats = last[provider]?.[model];
      const lifetimeStats = result[provider][model] ?? { requests: 0, tokens: 0, success: 0, failure: 0 };

      const deltaRequests = liveStats.requests - (lastStats?.requests ?? 0);
      const deltaTokens = liveStats.tokens - (lastStats?.tokens ?? 0);
      const deltaSuccess = liveStats.success - (lastStats?.success ?? 0);
      const deltaFailure = liveStats.failure - (lastStats?.failure ?? 0);

      result[provider][model] = {
        requests: lifetimeStats.requests + deltaRequests,
        tokens: lifetimeStats.tokens + deltaTokens,
        success: lifetimeStats.success + deltaSuccess,
        failure: lifetimeStats.failure + deltaFailure,
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** Envelope stored in localStorage — includes the live-fetch timestamp */
interface UsageCache {
  fetchedAt: number;
  data: UsageResponse;
  /** Lifetime accumulator — survives proxy restarts */
  lifetime?: LifetimeAccumulator;
  /** Last live snapshot used to compute deltas */
  lastSnapshot?: UsageResponse;
}

/** Lifetime accumulator — tracks totals across proxy restarts via delta accumulation */
interface LifetimeAccumulator {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  /** Per-provider → per-model breakdown */
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

/** Persist lifetime accumulator and last snapshot to both localStorage and disk cache. */
async function schedulePersistUsageCache(data: UsageResponse): Promise<void> {
  await saveToDiskCache(data);
}

async function saveToDiskCache(data: UsageResponse): Promise<void> {
  const lifetime = lifetimeAccumulator();
  const last = lastSnapshot();

  try {
    const envelope: UsageCache = {
      fetchedAt: Date.now(),
      data,
      lifetime: lifetime ?? undefined,
      lastSnapshot: last ?? undefined,
    };
    localStorage.setItem("aether:usage-cache", JSON.stringify(envelope));
  } catch (error) {
    // Non-critical (but keep observable for debugging)
    console.warn("[analytics] failed to write localStorage usage cache", error);
  }

  // Also persist to disk via Tauri for cross-session durability
  try {
    await invoke("write_usage_cache", { data });
  } catch (error) {
    // Non-critical (but keep observable for debugging)
    console.warn("[analytics] failed to write disk usage cache", error);
  }
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
      setPersistentAccumulator(envelope.data);
      setUsageStats(envelope.data);
      
      // Restore lifetime accumulator and last snapshot if available
      if (envelope.lifetime) {
        setLifetimeAccumulator(envelope.lifetime);
      } else {
        // Legacy cache without lifetime — initialize from snapshot
        setLifetimeAccumulator(initLifetimeFromSnapshot(envelope.data));
      }
      
      if (envelope.lastSnapshot) {
        setLastSnapshot(envelope.lastSnapshot);
      } else {
        setLastSnapshot(envelope.data);
      }
      
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
      setPersistentAccumulator(diskData);
      setUsageStats(diskData);
      
      // Disk cache has no lifetime data — initialize from snapshot
      setLifetimeAccumulator(initLifetimeFromSnapshot(diskData));
      setLastSnapshot(diskData);
      
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

    // Delta accumulation: compute lifetime from (lifetime, live, last)
    const currentLifetime = lifetimeAccumulator();
    const currentLast = lastSnapshot();
    
    console.log("[analytics] fetchStats delta computation:", {
      live_total: response.usage.total_requests,
      live_success: response.usage.success_count,
      live_failure: response.usage.failure_count,
      currentLifetime_total: currentLifetime?.total_requests ?? null,
      currentLast_total: currentLast?.usage.total_requests ?? null,
    });
    
    let newLifetime: LifetimeAccumulator;
    if (!currentLifetime) {
      // First fetch ever — initialize lifetime from live snapshot
      newLifetime = initLifetimeFromSnapshot(response);
      console.log("[analytics] initialized lifetime from snapshot:", {
        lifetime_total: newLifetime.total_requests,
      });
    } else {
      // Accumulate delta into lifetime
      newLifetime = accumulateDelta(currentLifetime, response, currentLast);
      console.log("[analytics] accumulated delta:", {
        lifetime_total: newLifetime.total_requests,
        delta: newLifetime.total_requests - currentLifetime.total_requests,
      });
    }

    // Update signals
    setLifetimeAccumulator(newLifetime);
    setLastSnapshot(response);
    setPersistentAccumulator(response);
    setUsageStats(response);

    const now = Date.now();
    setLastFetched(now);
    setCacheStatus(null); // Pure live data — no badge
    setHealth({
      lastSuccessSyncAt: now,
      consecutiveFailures: 0,
      dataQuality: "live",
    });
    await schedulePersistUsageCache(response);
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
async function startPolling(intervalMs = 60_000): Promise<void> {
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
   * null = live data. Non-null = cached.
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
