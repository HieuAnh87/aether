import { type Component, createMemo, onCleanup, onMount, For, Show } from "solid-js";
import {
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import { Bar, Line } from "solid-chartjs";
import type { CacheStatus, TimeRange } from "../stores/analyticsStore";
import GlassCard from "../components/GlassCard";
import { analyticsStore } from "../stores/analyticsStore";

Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

const GRID_COLOR = "oklch(0.74 0.008 75 / 0.14)";
const TICK_COLOR = "oklch(0.68 0.008 75 / 0.74)";
const TEXT_COLOR = "oklch(0.90 0.007 75)";
const TOOLTIP_BG = "oklch(0.16 0.008 60 / 0.96)";
const AMBER = "oklch(0.62 0.13 55)";
const AMBER_SOFT = "oklch(0.62 0.13 55 / 0.16)";
const GRAPHITE_LINE = "oklch(0.66 0.012 75 / 0.78)";
const GRAPHITE_FILL = "oklch(0.66 0.012 75 / 0.12)";
const REQUEST_BAR = "oklch(0.58 0.04 78 / 0.34)";
const REQUEST_BAR_BORDER = "oklch(0.68 0.05 78 / 0.62)";
const FALLBACK_RATE_PER_M = 0.50;
const COST_RATE = FALLBACK_RATE_PER_M / 1_000_000;

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "Month", value: "month" },
  { label: "All", value: "all" },
];

const MODEL_PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  openai: {
    "gpt-5.4": { input: 2.50, output: 5.00 },
    "gpt-5.4-mini": { input: 0.75, output: 4.50 },
    "gpt-5.4-nano": { input: 0.20, output: 1.25 },
    "gpt-5.2": { input: 1.75, output: 14.00 },
    "gpt-5.1": { input: 1.25, output: 10.00 },
    "gpt-5": { input: 1.25, output: 10.00 },
    "gpt-5-mini": { input: 0.25, output: 2.00 },
    "gpt-5-nano": { input: 0.05, output: 0.40 },
    "gpt-4.1": { input: 2.00, output: 8.00 },
    "gpt-4.1-mini": { input: 0.40, output: 1.60 },
    "gpt-4.1-nano": { input: 0.10, output: 0.40 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    o1: { input: 15.00, output: 60.00 },
    "o1-pro": { input: 150.00, output: 600.00 },
    o3: { input: 2.00, output: 8.00 },
    "o4-mini": { input: 1.10, output: 4.40 },
    "o3-mini": { input: 1.10, output: 4.40 },
    "o1-mini": { input: 1.10, output: 4.40 },
    "gpt-4": { input: 30.00, output: 60.00 },
    "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  },
  anthropic: {
    "claude-opus-4.6": { input: 5.00, output: 25.00 },
    "claude-opus-4.5": { input: 5.00, output: 25.00 },
    "claude-sonnet-4.6": { input: 3.00, output: 15.00 },
    "claude-sonnet-4.5": { input: 3.00, output: 15.00 },
    "claude-sonnet-4": { input: 3.00, output: 15.00 },
    "claude-haiku-4.5": { input: 1.00, output: 5.00 },
    "claude-haiku-3.5": { input: 0.80, output: 4.00 },
    "claude-haiku-3": { input: 0.25, output: 1.25 },
  },
  google: {
    "gemini-3.1-pro": { input: 2.00, output: 12.00 },
    "gemini-2.5-pro": { input: 1.25, output: 10.00 },
    "gemini-3-flash": { input: 0.50, output: 3.00 },
    "gemini-2.5-flash": { input: 0.15, output: 0.60 },
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  },
  vertexai: {
    "gemini-3.1-pro": { input: 2.00, output: 12.00 },
    "gemini-2.5-pro": { input: 1.25, output: 10.00 },
    "gemini-3-flash": { input: 0.50, output: 3.00 },
    "gemini-2.5-flash": { input: 0.15, output: 0.60 },
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
  },
  deepseek: {
    "deepseek-chat": { input: 0.30, output: 0.50 },
    "deepseek-coder": { input: 0.30, output: 0.50 },
  },
  perplexity: {
    sonar: { input: 1.00, output: 1.00 },
    "sonar-pro": { input: 2.00, output: 2.00 },
    "sonar-reasoning": { input: 2.00, output: 2.00 },
  },
  xai: {
    "grok-3": { input: 2.00, output: 6.00 },
    "grok-2": { input: 2.00, output: 6.00 },
    "grok-3-beta": { input: 5.00, output: 15.00 },
  },
  cohere: {
    "command-r-plus": { input: 3.00, output: 15.00 },
    "command-r": { input: 1.00, output: 1.00 },
  },
  mistral: {
    "mistral-large": { input: 2.00, output: 6.00 },
    "mistral-small": { input: 0.10, output: 0.30 },
    "mistral-medium": { input: 0.50, output: 1.50 },
  },
  fireworks: {
    firefunction: { input: 0.70, output: 2.00 },
  },
  azure: {},
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCurrency(n: number, digits = 2): string {
  return `$${n.toFixed(digits)}`;
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

function normalizeModelName(model: string): string {
  return model.toLowerCase().replace(/^models\//, "").split(":")[0] ?? model.toLowerCase();
}

function hasKnownRate(provider: string, model: string): boolean {
  return Boolean(MODEL_PRICING[provider]?.[normalizeModelName(model)]);
}

function lookupRate(provider: string, model: string): { input: number; output: number } {
  return MODEL_PRICING[provider]?.[normalizeModelName(model)] ?? {
    input: FALLBACK_RATE_PER_M,
    output: FALLBACK_RATE_PER_M,
  };
}

function blendedRateLabel(provider: string, model: string): string {
  const rate = lookupRate(provider, model);
  const blended = (rate.input + rate.output) / 2;
  return `${formatCurrency(blended, blended >= 10 ? 0 : 2)}/M blended`;
}

function rangeLabel(range: TimeRange): string {
  switch (range) {
    case "24h": return "last 24 hours";
    case "7d": return "last 7 days";
    case "30d": return "last 30 days";
    case "month": return "this month";
    case "all": return "all time";
  }
}

function rangeSlotCount(range: TimeRange, availableDays: number): number {
  switch (range) {
    case "24h": return 24;
    case "7d": return 7;
    case "30d": return 30;
    case "month": return new Date().getDate();
    case "all": return Math.max(availableDays, 7);
  }
}

const basePlugins = {
  legend: { display: false as const },
  tooltip: {
    backgroundColor: TOOLTIP_BG,
    borderColor: GRID_COLOR,
    borderWidth: 1,
    titleColor: TEXT_COLOR,
    bodyColor: TICK_COLOR,
    padding: 10,
    displayColors: false,
  },
} as const;

const chartScales = {
  x: {
    grid: { display: false },
    ticks: { color: TICK_COLOR, font: { size: 10 }, maxRotation: 0 },
    border: { display: false },
  },
  y: {
    grid: { color: GRID_COLOR },
    ticks: { color: TICK_COLOR, font: { size: 10 } },
    border: { display: false },
  },
} as const;

const costTrendOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: "index" },
  plugins: basePlugins,
  scales: chartScales,
};

const requestOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: basePlugins,
  scales: chartScales,
};

interface SummaryMetricProps {
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
  emphasis?: boolean;
}

const SummaryMetric: Component<SummaryMetricProps> = (props) => (
  <div class={props.emphasis ? "surface-inset rounded-lg p-3.5" : "rounded-lg p-3.5"}>
    <p class="font-caption text-text-muted">{props.label}</p>
    <Show when={!props.loading} fallback={<div class="skeleton mt-2.5 h-8 w-28" />}>
      <p class={`${props.emphasis ? "mt-1.5 text-2xl leading-none" : "mt-1.5 text-base"} font-semibold text-text tabular-nums tracking-tight`}>
        {props.value}
      </p>
    </Show>
    <p class="font-caption mt-1.5 text-text-muted">{props.sub}</p>
  </div>
);

const Analytics: Component = () => {
  onMount(() => {
    analyticsStore.startPolling(60_000).catch(() => {
      // Store exposes polling failures through analyticsStore.error().
    });
  });

  onCleanup(() => analyticsStore.stopPolling());

  const activeRange = () => analyticsStore.timeRange();
  const isInitialLoad = () => analyticsStore.loading() && analyticsStore.usageStats() === null;
  const hasUsage = () => analyticsStore.filteredTotalTokens() > 0 || analyticsStore.filteredTotalRequests() > 0;
  const estimatedSpend = () => analyticsStore.filteredCost();
  const costDrivers = () => analyticsStore.costByModel();
  const knownDriverCount = () => costDrivers().filter((driver) => hasKnownRate(driver.provider, driver.model)).length;
  const driversTotal = () => costDrivers().reduce((sum, driver) => sum + driver.cost, 0);
  const topDriver = () => costDrivers()[0] ?? null;
  const rangeText = () => rangeLabel(activeRange());

  const cacheStatus = (): CacheStatus | null => analyticsStore.cacheStatus();
  const isCached = () => cacheStatus() !== null;
  const proxyOffline = () => !analyticsStore.loading() && analyticsStore.error() !== null;
  const health = () => analyticsStore.health();
  const degraded = () => health().dataQuality === "degraded";

  const lastFetchedText = () => {
    const ts = analyticsStore.lastFetched();
    if (ts === null) return "not synced yet";
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const lastSuccessSyncText = () => {
    const ts = health().lastSuccessSyncAt;
    if (ts === null) return "never";
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const dataStatus = () => {
    if (proxyOffline()) return "Proxy stopped";
    if (degraded()) return "Degraded data";
    if (isCached()) return "Cached data";
    return `Live, synced ${lastFetchedText()}`;
  };

  const dataStatusTone = () => {
    if (proxyOffline()) return "status-error";
    if (degraded() || isCached()) return "status-warning";
    return "status-success";
  };

  const dataStatusDot = () => {
    if (proxyOffline()) return "status-dot-error";
    if (degraded() || isCached()) return "status-dot-warning";
    return "status-dot-success";
  };

  const confidenceText = () => {
    const totalDrivers = costDrivers().length;
    if (totalDrivers === 0) return "Estimated from reported token totals";
    if (knownDriverCount() === totalDrivers) return "Known model rates, blended input/output";
    return "Some models use fallback pricing";
  };

  const costTrendData = createMemo((): ChartData<"line"> => {
    const range = activeRange();

    if (range === "24h") {
      const tokens = analyticsStore.tokByHour();
      return {
        labels: HOUR_LABELS,
        datasets: [
          {
            label: "Estimated cost",
            data: tokens.map((tokenCount) => tokenCount * COST_RATE),
            fill: true,
            backgroundColor: AMBER_SOFT,
            borderColor: AMBER,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.38,
          },
          {
            label: "Token volume",
            data: tokens,
            fill: false,
            borderColor: GRAPHITE_LINE,
            backgroundColor: GRAPHITE_FILL,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.38,
          },
        ],
      };
    }

    const tokenDays = analyticsStore.tokByDay();
    const tokenMap = new Map(tokenDays.map((entry) => [entry.date, entry.tokens]));
    const slotCount = rangeSlotCount(range, tokenDays.length);
    const today = new Date();
    const slots: { date: string; label: string }[] = [];

    for (let i = slotCount - 1; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      slots.push({ date, label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
    }

    const tokenData = slots.map((slot) => tokenMap.get(slot.date) ?? 0);

    return {
      labels: slots.map((slot) => slot.label),
      datasets: [
        {
          label: "Estimated cost",
          data: tokenData.map((tokenCount) => tokenCount * COST_RATE),
          fill: true,
          backgroundColor: AMBER_SOFT,
          borderColor: AMBER,
          borderWidth: 2,
          pointRadius: slotCount > 14 ? 0 : 2,
          tension: 0.38,
        },
        {
          label: "Token volume",
          data: tokenData,
          fill: false,
          borderColor: GRAPHITE_LINE,
          backgroundColor: GRAPHITE_FILL,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.38,
        },
      ],
    };
  });

  const requestHourData = createMemo((): ChartData<"bar"> => ({
    labels: HOUR_LABELS,
    datasets: [
      {
        label: "Requests",
        data: analyticsStore.reqByHour(),
        backgroundColor: REQUEST_BAR,
        borderColor: REQUEST_BAR_BORDER,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }));

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-[65ch]">
          <h1 class="font-title text-text">Analytics</h1>
          <p class="font-caption mt-1 text-text-secondary">Estimated spend across models and providers.</p>
        </div>

        <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
          <span class={`chip ${dataStatusTone()} w-fit`}>
            <span class={`status-dot ${dataStatusDot()}`} />
            <span class="chip-content">{dataStatus()}</span>
          </span>

          <div class="flex flex-wrap items-center gap-1.5">
            <div class="surface-inset flex items-center gap-0.5 rounded-lg p-1" aria-label="Analytics time range">
              <For each={TIME_RANGES}>
                {(range) => (
                  <button
                    type="button"
                    aria-pressed={activeRange() === range.value}
                    onClick={() => analyticsStore.setTimeRange(range.value)}
                    class={`focus-ring min-h-8 rounded-md px-3 font-caption transition-colors ${
                      activeRange() === range.value
                        ? "bg-primary-muted text-text shadow-[inset_0_0_0_1px_var(--color-primary)]"
                        : "text-text-muted hover:bg-bg-surface-hover hover:text-text"
                    }`}
                  >
                    {range.label}
                  </button>
                )}
              </For>
            </div>

            <button
              type="button"
              onClick={() => analyticsStore.refresh()}
              disabled={analyticsStore.loading()}
              class="button button-secondary"
            >
              <Show when={analyticsStore.loading()} fallback={<>Refresh</>}>
                <span class="button-spinner" aria-hidden="true" />
                Syncing
              </Show>
            </button>
          </div>
        </div>
      </header>

      <Show when={degraded() && !proxyOffline()}>
        <section class="surface-panel rounded-lg border-warning/30 bg-warning-muted p-3.5" aria-live="polite">
          <p class="font-body text-warning">Analytics is degraded. Showing best-known values from local cache.</p>
          <p class="font-caption mt-1 text-text-muted">
            Last successful sync: {lastSuccessSyncText()}. Failed syncs: {health().consecutiveFailures}.
          </p>
        </section>
      </Show>

      <Show when={proxyOffline()}>
        <section class="surface-panel rounded-lg border-error/25 bg-error-muted p-3.5" aria-live="polite">
          <p class="font-body text-error">Proxy is stopped. Start the proxy to resume live cost tracking.</p>
          <Show when={isCached()}>
            <p class="font-caption mt-1 text-text-muted">Cached analytics remain available from a previous session.</p>
          </Show>
        </section>
      </Show>

      <GlassCard class="!p-0 overflow-hidden">
        <div class="grid gap-0 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <SummaryMetric
            label="Estimated spend"
            value={formatCurrency(estimatedSpend())}
            sub={`${rangeText()}, blended token estimate`}
            loading={isInitialLoad()}
            emphasis
          />
          <SummaryMetric
            label="Top driver"
            value={topDriver()?.model ?? "None yet"}
            sub={topDriver() ? `${topDriver()?.provider}, ${formatPercent(((topDriver()?.cost ?? 0) / Math.max(driversTotal(), 0.01)) * 100)} of drivers` : "No model costs reported"}
            loading={isInitialLoad()}
          />
          <SummaryMetric
            label="Tokens"
            value={formatTokens(analyticsStore.filteredTotalTokens())}
            sub={rangeText()}
            loading={isInitialLoad()}
          />
          <SummaryMetric
            label="Requests"
            value={analyticsStore.filteredTotalRequests().toLocaleString()}
            sub={rangeText()}
            loading={isInitialLoad()}
          />
        </div>
      </GlassCard>

      <div class="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <GlassCard>
          <div class="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="font-section-header text-text">Estimated cost over time</h2>
              <p class="font-caption mt-1 text-text-muted">Cost is primary. Token volume is included for context.</p>
            </div>
            <span class="chip chip-muted w-fit">{confidenceText()}</span>
          </div>

          <Show
            when={!isInitialLoad() && hasUsage()}
            fallback={
              <div class="flex h-64 items-center justify-center rounded-lg border border-border-muted bg-bg-elevated px-5 text-center">
                <p class="font-body max-w-[42ch] text-text-muted">
                  <Show when={isInitialLoad()} fallback="No cost data yet. Send requests through a configured preset to begin estimating spend.">
                    Loading analytics...
                  </Show>
                </p>
              </div>
            }
          >
            <div class="relative h-64">
              <Line data={costTrendData()} options={costTrendOptions} />
            </div>
          </Show>
        </GlassCard>

        <GlassCard>
          <div class="mb-3.5 flex items-start justify-between gap-3">
            <div>
              <h2 class="font-section-header text-text">Cost drivers</h2>
              <p class="font-caption mt-1 text-text-muted">Ranked by estimated model spend.</p>
            </div>
            <span class="chip chip-muted shrink-0">Top {costDrivers().length || 0}</span>
          </div>

          <Show
            when={costDrivers().length > 0}
            fallback={
              <div class="flex h-64 flex-col items-center justify-center rounded-lg border border-border-muted bg-bg-elevated px-5 text-center">
                <p class="font-body text-text">No cost drivers yet.</p>
                <p class="font-caption mt-2 max-w-[34ch] text-text-muted">
                  Send requests through the proxy. Aether will estimate spend once model token usage is reported.
                </p>
              </div>
            }
          >
            <div class="space-y-2.5">
              <For each={costDrivers()}>
                {(driver, index) => {
                  const share = () => (driver.cost / Math.max(driversTotal(), 0.01)) * 100;
                  const tokens = () => Math.round(driver.cost / (((lookupRate(driver.provider, driver.model).input + lookupRate(driver.provider, driver.model).output) / 2) / 1_000_000));

                  return (
                    <div class="rounded-lg border border-border-muted bg-bg-elevated p-3">
                      <div class="flex items-start gap-2.5">
                        <span class="font-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
                          {index() + 1}
                        </span>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-start justify-between gap-2.5">
                            <div class="min-w-0">
                              <p class="truncate text-[0.9375rem] font-medium text-text" title={driver.model}>{driver.model}</p>
                              <p class="font-caption mt-0.5 capitalize text-text-muted">{driver.provider}</p>
                            </div>
                            <div class="text-right">
                              <p class="text-[0.9375rem] font-medium text-text tabular-nums">{formatCurrency(driver.cost, 3)}</p>
                              <p class="font-caption text-text-muted tabular-nums">{formatPercent(share())}</p>
                            </div>
                          </div>

                          <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-surface">
                            <div
                              class="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, Math.max(3, share()))}%` }}
                            />
                          </div>

                          <div class="mt-2 flex flex-wrap items-center gap-1.5">
                            <span class="font-caption text-text-muted tabular-nums">{formatTokens(tokens())} tokens</span>
                            <span class="text-text-tertiary">/</span>
                            <span class="font-caption text-text-muted">{blendedRateLabel(driver.provider, driver.model)}</span>
                            <Show when={!hasKnownRate(driver.provider, driver.model)}>
                              <span class="chip status-warning !px-2 !py-1">fallback pricing</span>
                            </Show>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </GlassCard>
      </div>

      <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.55fr)]">
        <GlassCard>
          <div class="mb-3.5 flex items-start justify-between gap-3">
            <div>
              <h2 class="font-section-header text-text">Request rhythm</h2>
              <p class="font-caption mt-1 text-text-muted">Hourly request volume, used as cost context.</p>
            </div>
            <span class="chip chip-muted">24h</span>
          </div>

          <Show when={!isInitialLoad()} fallback={<div class="skeleton h-40 w-full" />}>
            <div class="relative h-40">
              <Bar data={requestHourData()} options={requestOptions} />
            </div>
          </Show>
        </GlassCard>

        <GlassCard>
          <h2 class="font-section-header text-text">Data quality</h2>
          <div class="mt-3.5 space-y-3.5">
            <div>
              <p class="font-caption text-text-muted">Status</p>
              <p class="font-body mt-1 text-text">{dataStatus()}</p>
            </div>
            <div>
              <p class="font-caption text-text-muted">Estimate basis</p>
              <p class="font-body mt-1 text-text">Costs are estimates based on reported token totals and known model rates.</p>
            </div>
            <div>
              <p class="font-caption text-text-muted">Model breakdown</p>
              <p class="font-body mt-1 text-text">Breakdown is range-adjusted from lifetime provider totals.</p>
            </div>
            <Show when={costDrivers().length > 0}>
              <div>
                <p class="font-caption text-text-muted">Pricing coverage</p>
                <p class="font-body mt-1 text-text">{knownDriverCount()} of {costDrivers().length} shown models use known rates.</p>
              </div>
            </Show>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Analytics;
