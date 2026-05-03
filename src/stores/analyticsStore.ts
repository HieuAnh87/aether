import { createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/** $0.50 per million tokens — flat rate for cost calculation */
const COST_RATE = 0.50 / 1_000_000; // = 0.0000005

/**
 * Per-model pricing in USD per million tokens.
 * Format: { [provider]: { [model]: { input: $/M, output: $/M } } }
 * Defaults to input/output 50/50 split when rates are equal (common case).
 * Rates as of May 2026.
 */
const MODEL_PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  openai: {
    "gpt-5.4":          { input: 2.50, output: 5.00 },
    "gpt-5.4-mini":     { input: 0.75, output: 4.50 },
    "gpt-5.4-nano":     { input: 0.20, output: 1.25 },
    "gpt-5.2":          { input: 1.75, output: 14.00 },
    "gpt-5.2-pro":      { input: 21.00, output: 168.00 },
    "gpt-5.1":          { input: 1.25, output: 10.00 },
    "gpt-5":            { input: 1.25, output: 10.00 },
    "gpt-5-mini":       { input: 0.25, output: 2.00 },
    "gpt-5-nano":       { input: 0.05, output: 0.40 },
    "gpt-5-pro":        { input: 15.00, output: 120.00 },
    "gpt-4.1":          { input: 2.00, output: 8.00 },
    "gpt-4.1-mini":     { input: 0.40, output: 1.60 },
    "gpt-4.1-nano":     { input: 0.10, output: 0.40 },
    "gpt-4o":           { input: 2.50, output: 10.00 },
    "gpt-4o-mini":      { input: 0.15, output: 0.60 },
    "o1":               { input: 15.00, output: 60.00 },
    "o1-pro":           { input: 150.00, output: 600.00 },
    "o3":               { input: 2.00, output: 8.00 },
    "o4-mini":          { input: 1.10, output: 4.40 },
    "o3-mini":          { input: 1.10, output: 4.40 },
    "o1-mini":          { input: 1.10, output: 4.40 },
    "gpt-4-turbo":      { input: 10.00, output: 30.00 },
    "gpt-4":            { input: 30.00, output: 60.00 },
    "gpt-3.5-turbo":   { input: 0.50, output: 1.50 },
  },
  anthropic: {
    "claude-opus-4.6":  { input: 5.00, output: 25.00 },
    "claude-opus-4.5":  { input: 5.00, output: 25.00 },
    "claude-sonnet-4.6":{ input: 3.00, output: 15.00 },
    "claude-sonnet-4.5":{ input: 3.00, output: 15.00 },
    "claude-sonnet-4":  { input: 3.00, output: 15.00 },
    "claude-haiku-4.5": { input: 1.00, output: 5.00 },
    "claude-haiku-3.5": { input: 0.80, output: 4.00 },
    "claude-haiku-3":   { input: 0.25, output: 1.25 },
  },
  google: {
    "gemini-3.1-pro":   { input: 2.00, output: 12.00 },
    "gemini-2.5-pro":   { input: 1.25, output: 10.00 },
    "gemini-3-flash":   { input: 0.50, output: 3.00 },
    "gemini-2.5-flash": { input: 0.15, output: 0.60 },
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  },
  vertexai: {
    "gemini-3.1-pro":   { input: 2.00, output: 12.00 },
    "gemini-2.5-pro":   { input: 1.25, output: 10.00 },
    "gemini-3-flash":   { input: 0.50, output: 3.00 },
    "gemini-2.5-flash": { input: 0.15, output: 0.60 },
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  },
  deepseek: {
    "deepseek-chat":    { input: 0.30, output: 0.50 },
    "deepseek-coder":   { input: 0.30, output: 0.50 },
  },
  perplexity: {
    "sonar":            { input: 1.00, output: 1.00 },
    "sonar-pro":       { input: 2.00, output: 2.00 },
    "sonar-reasoning":  { input: 2.00, output: 2.00 },
  },
  xai: {
    "grok-3":          { input: 2.00, output: 6.00 },
    "grok-2":           { input: 2.00, output: 6.00 },
    "grok-3-beta":      { input: 5.00, output: 15.00 },
  },
  cohere: {
    "command-r-plus":   { input: 3.00, output: 15.00 },
    "command-r":        { input: 1.00, output: 1.00 },
  },
  mistral: {
    "mistral-large":    { input: 2.00, output: 6.00 },
    "mistral-small":    { input: 0.10, output: 0.30 },
    "mistral-medium":   { input: 0.50, output: 1.50 },
  },
  fireworks: {
    "firefunction":     { input: 0.70, output: 2.00 },
  },
  azure: {
    // Azure OpenAI uses same pricing as OpenAI, but key is the deployment name
    // which user controls. Map conservatively.
  },
};

// Default flat rate if model not found in pricing map (fallback)
const DEFAULT_RATE_PER_M = 0.50;

/** Look up $/M rate for a model. Falls back to DEFAULT_RATE_PER_M. */
function lookupModelRate(provider: string, model: string): { input: number; output: number } {
  // Try direct provider match first
  const providerRates = MODEL_PRICING[provider];
  if (providerRates) {
    const modelRates = providerRates[model];
    if (modelRates) return modelRates;
  }
  // Fallback: try to infer provider from model name
  const inferred = inferProviderFromModel(model);
  if (inferred !== "unknown" && inferred !== "other") {
    const inferredRates = MODEL_PRICING[inferred];
    if (inferredRates) {
      const modelRates = inferredRates[model];
      if (modelRates) return modelRates;
    }
  }
  return { input: DEFAULT_RATE_PER_M, output: DEFAULT_RATE_PER_M };
}

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
  provider: string;   // normalized display name (e.g. "openai")
  rawProvider?: string; // original raw key from CLIProxy
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

export type TimeRange = "24h" | "7d" | "30d" | "month" | "all";

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
  else if (range === "24h") return today;
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

/** Raw daily token data sorted ascending — used by costByDay and filteredTokByDay */
const tokByDay = createMemo(() => {
  const map = lifetimeAccumulator()?.tokens_by_day ?? {};
  return Object.entries(map)
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => a.date.localeCompare(b.date));
});

/** Daily request data filtered by active time range, capped at 7 most recent days */
const filteredReqByDay = createMemo(() => {
  const range = timeRange();
  const all = reqByDay();
  if (range === "all") return all;
  if (range === "24h") return all.slice(-1);

  const cutoffStr = rangeCutoff(range);
  if (!cutoffStr) return all;

  return all.filter((d) => d.date >= cutoffStr).slice(-7);
});

/** Daily cost data filtered by active time range */
const costByDay = createMemo(() => {
  const range = timeRange();
  const all = tokByDay();
  if (range === "all") return all;
  if (range === "24h") return all.slice(-1);
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
  if (range === "24h") return todayRequests();
  if (range === "all") return totalRequests();
  return filteredReqByDay().reduce((sum, d) => sum + d.count, 0);
});

/**
 * Total tokens within the active time range.
 * Note: tokens_by_day is available in LifetimeAccumulator for accurate filtered sums.
 */
const filteredTotalTokens = createMemo(() => {
  const range = timeRange();
  if (range === "24h") {
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

/** Estimated cost within the active time range. tokens × $0.50/M. */
const filteredCost = createMemo(() => filteredTotalTokens() * COST_RATE);

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
      // Normalize provider: strip URL paths, keep hostname. "POST /v1/chat/completions" → "openai"
      const normalized = normalizeProviderName(provider);
      return { provider: normalized, rawProvider: provider, requests, tokens, models: modelNames };
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

/** Normalize a raw provider key into a display name. */
function normalizeProviderName(raw: string): string {
  if (!raw) return "unknown";
  // URL path like "POST /v1/chat/completions" → extract clean name
  if (raw.startsWith("POST") || raw.startsWith("GET") || raw.startsWith("/")) {
    const parts = raw.split(" ");
    const path = parts[parts.length - 1] ?? raw;
    if (path.includes("chat")) return "openai";
    if (path.includes("models") && path.includes("v1")) return "google";
    if (path.includes("anthropic")) return "anthropic";
    if (path.includes("vertexai") || path.includes("google-vertex")) return "vertexai";
    if (path.includes("deepseek")) return "deepseek";
    if (path.includes("perplexity")) return "perplexity";
    if (path.includes("xai") || path.includes("grok")) return "xai";
    if (path.includes("cohere")) return "cohere";
    if (path.includes("mistral")) return "mistral";
    if (path.includes("minimax")) return "minimax";
    return path.replace(/^\//, "").split("/")[0];
  }
  // Already a clean name like "openai", "anthropic"
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize a model name for pricing lookup (CLIProxy uses "-" but MODEL_PRICING uses "."). */
function normalizeModelName(model: string): string {
  return model.toLowerCase().replace(/-/g, ".");
}

/**
 * Infer provider from model name when raw provider is a URL or unknown.
 * Only used as fallback when normalizeProviderName returns "unknown" or a generic path token.
 */
function inferProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
  if (m.includes("gemini") || m.includes("gemma")) return "google";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("sonar")) return "perplexity";
  if (m.includes("grok")) return "xai";
  if (m.includes("command-r")) return "cohere";
  if (m.includes("mistral")) return "mistral";
  if (m.includes("minimax")) return "minimax";
  if (m.includes("llama") || m.includes("qwen") || m.includes("mixtral")) return "other";
  return "unknown";
}

/** Per-model cost breakdown using real per-model pricing. Top 5, rounded to 3 decimal places. */
const costByModel = createMemo((): { model: string; provider: string; cost: number }[] => {
  const apis = lifetimeAccumulator()?.apis ?? {};
  const total = totalTokens();
  const filtered = filteredTotalTokens();
  const factor = total > 0 ? filtered / total : 0;

  const results: { model: string; provider: string; cost: number }[] = [];
  for (const [rawProvider, models] of Object.entries(apis)) {
    const provider = normalizeProviderName(rawProvider);
    for (const [rawModel, stats] of Object.entries(models)) {
      const model = normalizeModelName(rawModel);
      const tokens = Math.round((stats.tokens ?? 0) * factor);
      if (tokens <= 0) continue;

      const rates = lookupModelRate(provider, model);
      // Use average of input/output as approximation (tokens are total, no split available)
      const avgRate = (rates.input + rates.output) / 2 / 1_000_000;
      const cost = parseFloat((tokens * avgRate).toFixed(3));

      results.push({ model: rawModel, provider, cost });
    }
  }
  return results
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);
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
  tokByDay,
  filteredReqByDay,
  todayRequests,
  filteredTotalRequests,
  filteredTotalTokens,
  filteredFailedRequests,
  providerStats,
  filteredCost,
  costByDay,
  costByModel,
  // Time range
  timeRange,
  setTimeRange,
  // Actions
  startPolling,
  stopPolling,
  refresh,
};
