import { type Component, createMemo, onMount, onCleanup, Show, For } from "solid-js";
import type { CacheStatus } from "../stores/analyticsStore";
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
import { Bar, Line, Doughnut } from "solid-chartjs";
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

const doughnutOptions: ChartOptions<"doughnut"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: "bottom" as const,
      labels: {
        color: TICK_COLOR,
        font: { size: 11 },
        padding: 12,
        boxWidth: 12,
      },
    },
    tooltip: basePlugins.tooltip,
  },
};

// Hour labels 00:00 – 23:00
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`,
);

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

/** Format a token count as a compact string: 1.2M, 34.5K, or raw number. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
    analyticsStore.startPolling(30_000).catch(() => {
      // Polling init failure is already surfaced via analyticsStore.error()
    });
  });
  onCleanup(() => analyticsStore.stopPolling());

  // Derived display values
  const totalReqs = () => analyticsStore.totalRequests().toLocaleString();
  const totalToks = () => formatTokens(analyticsStore.totalTokens());
  const todayReqs = () => analyticsStore.todayRequests().toLocaleString();
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
        borderWidth: 1.5,
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

  const reqDayData = createMemo((): ChartData<"bar"> => {
    const days = analyticsStore.reqByDay();
    return {
      labels: days.map((d) => {
        // Parse as local date (append T00:00:00 avoids UTC interpretation)
        const dt = new Date(`${d.date}T00:00:00`);
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }),
      datasets: [
        {
          label: "Requests",
          data: days.map((d) => d.count),
          backgroundColor: PRIMARY_BG,
          borderColor: PRIMARY,
          borderWidth: 2,
          borderRadius: 4,
        },
      ],
    };
  });

  /** Doughnut chart data for provider breakdown */
  const providerDoughnutData = createMemo((): ChartData<"doughnut"> | null => {
    const stats = analyticsStore.providerStats();
    if (stats.length === 0) return null;
    return {
      labels: stats.map((p) => p.provider),
      datasets: [
        {
          data: stats.map((p) => p.requests),
          backgroundColor: stats.map((_, i) => PROVIDER_COLORS[i % PROVIDER_COLORS.length]),
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    };
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

  /** Reactive — computed each render so it stays correct after midnight */
  const todaySub = () =>
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total Requests"
          value={totalReqs()}
          sub="all time"
          icon="📡"
          loading={isInitialLoad()}
        />
        <KpiCard
          label="Today's Requests"
          value={todayReqs()}
          sub={todaySub()}
          icon="📅"
          loading={isInitialLoad()}
        />
        <KpiCard
          label="Total Tokens"
          value={totalToks()}
          sub="all time"
          icon="🪙"
          loading={isInitialLoad()}
        />
        <KpiCard
          label="Failed Requests"
          value={analyticsStore.failedRequests().toLocaleString()}
          sub="all time"
          icon="⚠️"
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

      {/* ── Charts Row 2: daily trend + provider breakdown ── */}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily trend — takes 2/3 width */}
        <GlassCard class="lg:col-span-2">
          <h3 class="font-section-header text-text mb-4">
            Daily Request Trend (last 7 days)
          </h3>
          <Show
            when={analyticsStore.reqByDay().length > 0}
            fallback={
              <div class="flex items-center justify-center h-52 text-text-muted font-body text-sm">
                {analyticsStore.loading() ? "Loading…" : "No daily data available."}
              </div>
            }
          >
            <div class="relative h-52">
              <Bar data={reqDayData()} options={barOptions} />
            </div>
          </Show>
        </GlassCard>

        {/* Provider breakdown — 1/3 width */}
        <GlassCard>
          <h3 class="font-section-header text-text mb-4">By Provider</h3>
          <Show
            when={providerDoughnutData()}
            keyed
            fallback={
              <div class="flex flex-col items-center justify-center h-52 gap-2">
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
            }
          >
            {(data) => (
              <div class="relative h-52">
                <Doughnut data={data} options={doughnutOptions} />
              </div>
            )}
          </Show>
        </GlassCard>
      </div>

      {/* ── Provider details table (only shown when data exists) ── */}
      <Show when={analyticsStore.providerStats().length > 0}>
        <GlassCard>
          <h3 class="font-section-header text-text mb-4">Provider Details</h3>
          <div class="space-y-2">
            <For each={analyticsStore.providerStats()}>
              {(stat, i) => (
                <div class="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  {/* color dot */}
                  <div
                    class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: PROVIDER_COLORS[i() % PROVIDER_COLORS.length] }}
                  />
                  <div class="flex-1 min-w-0">
                    <p class="font-body text-text truncate capitalize">{stat.provider}</p>
                    <p class="font-caption text-text-muted text-xs">
                      {stat.models.length} model{stat.models.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-body text-text tabular-nums">
                      {stat.requests.toLocaleString()} req
                    </p>
                    <p class="font-caption text-text-muted tabular-nums text-xs">
                      {formatTokens(stat.tokens)} tok
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
