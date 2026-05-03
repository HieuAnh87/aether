import { type Component, createMemo, onMount, onCleanup, Show, For } from "solid-js";
import type { CacheStatus, TimeRange } from "../stores/analyticsStore";
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import { Bar, Line } from "solid-chartjs";
import GlassCard from "../components/GlassCard";
import { analyticsStore } from "../stores/analyticsStore";

// ---------------------------------------------------------------------------
// Chart.js registration — module-level, idempotent
// ---------------------------------------------------------------------------
// Bar/Line from solid-chartjs auto-register their controllers,
// but we need LinearScale, Tooltip, Legend, Filler, ArcElement explicitly.
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

// ---------------------------------------------------------------------------
// Design tokens (glassmorphism dark palette)
// ---------------------------------------------------------------------------

const GRID_COLOR = "rgba(255,255,255,0.06)";
const TICK_COLOR = "rgba(255,255,255,0.35)";
const PRIMARY = "rgba(99,102,241,1)";
const PRIMARY_BG = "rgba(99,102,241,0.15)";
const ACCENT = "rgba(56,189,248,1)";
const ACCENT_BG = "rgba(56,189,248,0.15)";
const COST_COLOR = "rgba(251,191,36,1)";     // amber — cost line

/** Provider color palette for charts/badges */
const PROVIDER_COLORS = [
  "rgba(99,102,241,0.85)",   // indigo
  "rgba(56,189,248,0.85)",   // sky
  "rgba(52,211,153,0.85)",   // emerald
  "rgba(251,191,36,0.85)",   // amber
  "rgba(248,113,113,0.85)",  // red
  "rgba(167,139,250,0.85)",  // violet
  "rgba(251,146,60,0.85)",   // orange
  "rgba(34,211,238,0.85)",   // cyan
];

// ---------------------------------------------------------------------------
// Shared chart option objects — module-level to avoid object churn per render
// ---------------------------------------------------------------------------

const baseScales = {
  x: {
    grid: { color: GRID_COLOR },
    ticks: { color: TICK_COLOR, font: { size: 11 } },
    border: { display: false },
  },
  y: {
    grid: { color: GRID_COLOR },
    ticks: { color: TICK_COLOR, font: { size: 11 } },
    border: { display: false },
  },
} as const;

const basePlugins = {
  legend: { display: false as const },
  tooltip: {
    backgroundColor: "rgba(15,15,20,0.9)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    titleColor: "rgba(255,255,255,0.8)",
    bodyColor: "rgba(255,255,255,0.6)",
  },
} as const;

const barOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: basePlugins,
  scales: baseScales,
};

const lineOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: basePlugins,
  scales: baseScales,
};

const dualAxisOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: basePlugins,
  scales: {
    x: {
      ...baseScales.x,
      ticks: {
        color: TICK_COLOR,
        font: { size: 11 },
        autoSkip: false,
        maxRotation: 0,
      },
    },
    y: {
      ...baseScales.y,
      position: "left" as const,
      title: { display: true, text: "Tokens", color: TICK_COLOR, font: { size: 10 } },
    },
    y1: {
      ...baseScales.y,
      position: "right" as const,
      title: { display: true, text: "Cost ($)", color: TICK_COLOR, font: { size: 10 } },
      grid: { drawOnChartArea: false },
      ticks: { color: TICK_COLOR, font: { size: 11 }, callback: (v: number | string) => `$${Number(v).toFixed(2)}` },
    },
  },
};

// Hour labels 00:00 – 23:00
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`,
);

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "Month", value: "month" },
  { label: "All", value: "all" },
];

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

/** Format a token count as a compact string: 1.2M, 34.5K, or raw number. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const DEFAULT_RATE_PER_M = 0.50;

/** Lookup $/M rate for a model (mirrors MODEL_PRICING from analyticsStore). */
function lookupRate(provider: string, model: string): { input: number; output: number } {
  const pricing: Record<string, Record<string, { input: number; output: number }>> = {
    openai: {
      "gpt-5.4": { input: 2.50, output: 5.00 }, "gpt-5.4-mini": { input: 0.75, output: 4.50 },
      "gpt-5.4-nano": { input: 0.20, output: 1.25 }, "gpt-5.2": { input: 1.75, output: 14.00 },
      "gpt-5.1": { input: 1.25, output: 10.00 }, "gpt-5": { input: 1.25, output: 10.00 },
      "gpt-5-mini": { input: 0.25, output: 2.00 }, "gpt-5-nano": { input: 0.05, output: 0.40 },
      "gpt-4.1": { input: 2.00, output: 8.00 }, "gpt-4.1-mini": { input: 0.40, output: 1.60 },
      "gpt-4.1-nano": { input: 0.10, output: 0.40 }, "gpt-4o": { input: 2.50, output: 10.00 },
      "gpt-4o-mini": { input: 0.15, output: 0.60 }, "o1": { input: 15.00, output: 60.00 },
      "o1-pro": { input: 150.00, output: 600.00 }, "o3": { input: 2.00, output: 8.00 },
      "o4-mini": { input: 1.10, output: 4.40 }, "o3-mini": { input: 1.10, output: 4.40 },
      "o1-mini": { input: 1.10, output: 4.40 }, "gpt-4": { input: 30.00, output: 60.00 },
      "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
    },
    anthropic: {
      "claude-opus-4.6": { input: 5.00, output: 25.00 }, "claude-opus-4.5": { input: 5.00, output: 25.00 },
      "claude-sonnet-4.6": { input: 3.00, output: 15.00 }, "claude-sonnet-4.5": { input: 3.00, output: 15.00 },
      "claude-haiku-4.5": { input: 1.00, output: 5.00 }, "claude-haiku-3.5": { input: 0.80, output: 4.00 },
      "claude-haiku-3": { input: 0.25, output: 1.25 },
    },
    google: {
      "gemini-3.1-pro": { input: 2.00, output: 12.00 }, "gemini-2.5-pro": { input: 1.25, output: 10.00 },
      "gemini-3-flash": { input: 0.50, output: 3.00 }, "gemini-2.5-flash": { input: 0.15, output: 0.60 },
      "gemini-2.0-flash": { input: 0.10, output: 0.40 }, "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
    },
    deepseek: { "deepseek-chat": { input: 0.30, output: 0.50 }, "deepseek-coder": { input: 0.30, output: 0.50 } },
    perplexity: { "sonar": { input: 1.00, output: 1.00 }, "sonar-pro": { input: 2.00, output: 2.00 } },
    xai: { "grok-3": { input: 2.00, output: 6.00 }, "grok-2": { input: 2.00, output: 6.00 } },
    cohere: { "command-r-plus": { input: 3.00, output: 15.00 }, "command-r": { input: 1.00, output: 1.00 } },
    mistral: { "mistral-large": { input: 2.00, output: 6.00 }, "mistral-small": { input: 0.10, output: 0.30 } },
  };
  const p = pricing[provider]?.[model];
  if (!p) return { input: DEFAULT_RATE_PER_M, output: DEFAULT_RATE_PER_M };
  return p;
}

// ---------------------------------------------------------------------------
// KpiCard sub-component
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  loading?: boolean;
}

const KpiCard: Component<KpiCardProps> = (props) => (
  <GlassCard class="!p-4">
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <p class="font-caption text-text-muted mb-1">{props.label}</p>
        <Show
          when={!props.loading}
          fallback={<div class="h-7 w-24 rounded bg-white/[0.05] animate-pulse" />}
        >
          <p class="text-2xl font-semibold text-text tabular-nums">{props.value}</p>
        </Show>
        <Show when={!props.loading && props.sub !== undefined}>
          <p class="font-caption text-text-muted mt-1">{props.sub}</p>
        </Show>
      </div>
      <span class="text-2xl ml-3 opacity-70">{props.icon}</span>
    </div>
  </GlassCard>
);

// ---------------------------------------------------------------------------
// Analytics page
// ---------------------------------------------------------------------------

const Analytics: Component = () => {
  onMount(() => {
    // startPolling is async — errors inside are captured in analyticsStore.error()
    analyticsStore.startPolling(60_000).catch(() => {
      // Polling init failure is already surfaced via analyticsStore.error()
    });
  });
  onCleanup(() => analyticsStore.stopPolling());

  // Derived display values
  const totalReqs = () => analyticsStore.filteredTotalRequests().toLocaleString();
  const totalToks = () => formatTokens(analyticsStore.filteredTotalTokens());

  const activeRange = () => analyticsStore.timeRange();
  const isInitialLoad = () => analyticsStore.loading() && analyticsStore.usageStats() === null;

  // Chart data memos — new object references trigger solid-chartjs reactive updates
  const reqHourData = createMemo((): ChartData<"bar"> => ({
    labels: HOUR_LABELS,
    datasets: [
      {
        label: "Requests",
        data: analyticsStore.reqByHour(),
        backgroundColor: PRIMARY_BG,
        borderColor: PRIMARY,
        borderWidth: 2,
        borderRadius: 3,
      },
    ],
  }));

  const tokHourData = createMemo((): ChartData<"line"> => ({
    labels: HOUR_LABELS,
    datasets: [
      {
        label: "Tokens",
        data: analyticsStore.tokByHour(),
        fill: true,
        backgroundColor: ACCENT_BG,
        borderColor: ACCENT,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  }));

  /**
   * Dual-axis Usage Trends chart:
   * - 24h: hourly tokens (left) + hourly cost (right), 24 labels
   * - 7d+: daily tokens (left) + daily cost (right), up to 7 day labels
   * Right-axis cost uses $0.50/M flat rate applied to token counts.
   */
  const usageTrendsData = createMemo((): ChartData<"line"> => {
    const range = activeRange();
    const COST_RATE = 0.0000005;

    if (range === "24h") {
      // Hourly data: 24 labels, tokens from tokByHour, cost = tokens × rate
      const tokArr = analyticsStore.tokByHour();
      const costArr = tokArr.map((t) => t * COST_RATE);
      return {
        labels: HOUR_LABELS,
        datasets: [
          {
            label: "Tokens",
            data: tokArr,
            yAxisID: "y",
            fill: true,
            backgroundColor: ACCENT_BG,
            borderColor: ACCENT,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: "Cost",
            data: costArr,
            yAxisID: "y1",
            fill: false,
            backgroundColor: "transparent",
            borderColor: COST_COLOR,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
          },
        ],
      };
    }

    // Non-24h: build full label slots for the range, fill zeros for missing days
    const allDays = analyticsStore.tokByDay();
    const cutoff = (() => {
      if (range === "7d") {
        const d = new Date(); d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
      }
      if (range === "30d") {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      }
      if (range === "month") {
        const d = new Date(); d.setDate(1);
        return d.toISOString().slice(0, 10);
      }
      return null; // "all"
    })();
    const tokDays = cutoff ? allDays.filter((d: { date: string; tokens: number }) => d.date >= cutoff).slice(-7) : allDays.slice(-7);

    // Determine slot count and build full label slots
    const slotCount = range === "7d" ? 7 : range === "30d" ? 30 : range === "month" ? 31 : allDays.length || 7;
    const today = new Date();
    const labelSlots: { dateStr: string; label: string }[] = [];
    for (let i = slotCount - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      labelSlots.push({ dateStr, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
    }
    const tokDaysMap = new Map(tokDays.map((d) => [d.date, d.tokens]));
    const tokenData = labelSlots.map((slot) => tokDaysMap.get(slot.dateStr) ?? 0);
    const labels = labelSlots.map((slot) => slot.label);
    const costData = tokenData.map((toks: number) => toks * COST_RATE);

    return {
      labels,
      datasets: [
        {
          label: "Tokens",
          data: tokenData,
          yAxisID: "y",
          fill: true,
          backgroundColor: ACCENT_BG,
          borderColor: ACCENT,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
        },
        {
          label: "Cost",
          data: costData,
          yAxisID: "y1",
          fill: false,
          backgroundColor: "transparent",
          borderColor: COST_COLOR,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
        },
      ],
    };
  });

  const dailyChartTitle = createMemo(() => {
    switch (activeRange()) {
      case "24h": return "Usage Trends";
      case "7d": return "Daily — Last 7 Days";
      case "30d": return "Daily — Last 30 Days";
      case "month": return "Daily — This Month";
      case "all": return "Daily — All Time";
    }
  });

  const lastFetchedStr = () => {
    const ts = analyticsStore.lastFetched();
    if (ts === null) return null;
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const cs = (): CacheStatus | null => analyticsStore.cacheStatus();
  const isCached = () => cs() !== null;

  /** Human-readable cache badge label e.g. "Cached from 2:30 PM" or just "Cached" */
  const cachedBadgeText = () => {
    const status = cs();
    if (!status) return "";
    if (status.source === "localStorage") {
      const time = new Date(status.at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Cached from ${time}`;
    }
    return "Cached"; // disk cache — no timestamp available
  };

  const proxyOffline = () => !analyticsStore.loading() && analyticsStore.error() !== null;
  const health = () => analyticsStore.health();
  const degraded = () => health().dataQuality === "degraded";
  const lastSuccessSyncText = () => {
    const ts = health().lastSuccessSyncAt;
    if (ts === null) return "never";
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const rangeSub = () => {
    switch (activeRange()) {
      case "24h": return "last 24 hours";
      case "7d": return "last 7 days";
      case "30d": return "last 30 days";
      case "month": return "this month";
      case "all": return "all time";
    }
  };

  return (
    <div class="space-y-6">
      {/* ── Header ── */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Analytics</h1>
          <p class="font-body text-text-secondary mt-1">
            Usage insights from your AI proxy.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <Show when={isCached()}>
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              {cachedBadgeText()}
            </span>
          </Show>
          <Show when={lastFetchedStr() && !proxyOffline()}>
            <span class="font-caption text-text-muted">Live {lastFetchedStr()}</span>
          </Show>
          {/* Time range filter */}
          <div class="flex items-center rounded-md bg-white/[0.04] p-0.5 gap-0.5">
            <For each={TIME_RANGES}>
              {(tr) => (
                <button
                  onClick={() => analyticsStore.setTimeRange(tr.value)}
                  class={`px-2.5 py-1 rounded text-xs font-caption transition-colors ${
                    activeRange() === tr.value
                      ? "bg-white/10 text-text"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {tr.label}
                </button>
              )}
            </For>
          </div>
          <button
            onClick={() => analyticsStore.refresh()}
            disabled={analyticsStore.loading()}
            class="glass rounded-md px-3 py-1.5 font-caption text-text-secondary hover:text-text transition-colors disabled:opacity-40"
          >
            <Show when={analyticsStore.loading()} fallback={<>↻ Refresh</>}>
              <span class="animate-spin inline-block">↻</span>
            </Show>
          </button>
        </div>
      </div>

      {/* ── Offline banner ── */}
      <Show when={degraded() && !proxyOffline()}>
        <div class="glass rounded-lg p-4 border border-amber-500/20 bg-amber-500/5">
          <p class="font-body text-amber-400/85 text-sm">
            ⚠ Analytics is in degraded mode ({health().consecutiveFailures} sync failure{health().consecutiveFailures > 1 ? "s" : ""}).
            Showing best-known values from local cache.
          </p>
          <p class="font-caption text-text-muted mt-1 text-xs">Last successful sync: {lastSuccessSyncText()}</p>
        </div>
      </Show>

      <Show when={proxyOffline()}>
        <div class="glass rounded-lg p-4 border border-yellow-500/20 bg-yellow-500/5">
          <p class="font-body text-yellow-400/80 text-sm">
            ⚠ Proxy is not running. Start the proxy to see live analytics.
          </p>
          <Show when={isCached()}>
            <p class="font-caption text-text-muted mt-1 text-xs">Showing cached data from a previous session.</p>
          </Show>
        </div>
      </Show>

      {/* ── KPI Cards ── */}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Total Requests"
          value={totalReqs()}
          sub={rangeSub()}
          icon="📡"
          loading={isInitialLoad()}
        />
        <KpiCard
          label="Total Tokens"
          value={totalToks()}
          sub={rangeSub()}
          icon="🪙"
          loading={isInitialLoad()}
        />
        <KpiCard
          label="Est. Cost"
          value={`$${analyticsStore.filteredCost().toFixed(2)}`}
          sub={rangeSub()}
          icon="💰"
          loading={isInitialLoad()}
        />
      </div>

      {/* ── Charts Row 1: by-hour ── */}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 class="font-section-header text-text mb-4">Requests by Hour</h3>
          <Show
            when={!isInitialLoad()}
            fallback={<div class="h-52 w-full rounded bg-white/[0.04] animate-pulse" />}
          >
            <div class="relative h-52">
              <Bar data={reqHourData()} options={barOptions} />
            </div>
          </Show>
        </GlassCard>

        <GlassCard>
          <h3 class="font-section-header text-text mb-4">Token Usage by Hour</h3>
          <Show
            when={!isInitialLoad()}
            fallback={<div class="h-52 w-full rounded bg-white/[0.04] animate-pulse" />}
          >
            <div class="relative h-52">
              <Line data={tokHourData()} options={lineOptions} />
            </div>
          </Show>
        </GlassCard>
      </div>

      {/* ── Usage Trends: full-width row ── */}
      <GlassCard>
        <h3 class="font-section-header text-text mb-4">
          {dailyChartTitle()}
        </h3>
        <Show
          when={analyticsStore.costByDay().length > 0}
          fallback={
            <div class="flex items-center justify-center h-52 text-text-muted font-body text-sm">
              {analyticsStore.loading() ? "Loading…" : "No daily data available."}
            </div>
          }
        >
          <div class="relative h-52">
            <Line data={usageTrendsData()} options={dualAxisOptions} />
          </div>
        </Show>
      </GlassCard>

      {/* ── Cost by Model (merged list — top 5, $ rounded to 3 decimals) ── */}
      <Show
        when={analyticsStore.costByModel().length > 0}
        fallback={
          <GlassCard>
            <h3 class="font-section-header text-text mb-4">Cost by Model</h3>
            <div class="flex flex-col items-center justify-center h-40 gap-2">
              <span class="text-3xl opacity-30">📊</span>
              <p class="font-caption text-text-muted text-center text-xs">
                <Show when={isInitialLoad()} fallback={
                  <>
                    No provider data yet.
                    <br />
                    Send requests through the proxy to see breakdown.
                  </>
                }>
                  Loading…
                </Show>
              </p>
            </div>
          </GlassCard>
        }
      >
        <GlassCard>
          <h3 class="font-section-header text-text mb-4">Cost by Model</h3>
          <div class="space-y-2">
            <For each={analyticsStore.costByModel()}>
              {(stat, i) => (
                <div class="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div
                    class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: PROVIDER_COLORS[i() % PROVIDER_COLORS.length] }}
                  />
                  <div class="flex-1 min-w-0">
                    <p class="font-body text-text truncate">{stat.model}</p>
                    <p class="font-caption text-text-muted text-xs capitalize">{stat.provider}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-body text-text tabular-nums">${stat.cost.toFixed(3)}</p>
                    <p class="font-caption text-text-muted tabular-nums text-xs">
                      {formatTokens(Math.round(stat.cost / (((lookupRate(stat.provider, stat.model).input + lookupRate(stat.provider, stat.model).output) / 2) / 1_000_000)))} tok
                    </p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </GlassCard>
      </Show>
    </div>
  );
};

export default Analytics;
