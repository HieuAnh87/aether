import type { Component } from "solid-js";
import { For, Show, Suspense, createMemo, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import GlassCard from "../components/GlassCard";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { presetStore, splitModelId } from "../stores/presetStore";
import { proxyStore } from "../stores/proxyStore";
import { requestStore } from "../stores/requestStore";
import { accountStore } from "../stores/accountStore";
import { analyticsStore } from "../stores/analyticsStore";

const statusCopy = {
  running: {
    label: "Running",
    title: "Proxy is ready",
    description: "Local tools can route requests through Aether.",
    tone: "success",
  },
  stopped: {
    label: "Stopped",
    title: "Proxy is off",
    description: "Start the proxy before routing model requests.",
    tone: "error",
  },
  starting: {
    label: "Starting",
    title: "Proxy is warming up",
    description: "Aether is launching the sidecar now.",
    tone: "warning",
  },
  stopping: {
    label: "Stopping",
    title: "Proxy is shutting down",
    description: "Open requests can finish before it stops.",
    tone: "warning",
  },
  degraded: {
    label: "Degraded",
    title: "Proxy needs attention",
    description: "Routing may work, but one service is unhealthy.",
    tone: "warning",
  },
  crashed: {
    label: "Crashed",
    title: "Proxy stopped unexpectedly",
    description: "Restart the proxy to resume local routing.",
    tone: "error",
  },
} as const;

const statusToneClasses = {
  success: {
    dot: "bg-success",
    text: "text-success",
    badge: "status-success border-success/20",
    panel: "border-success/30 bg-success-muted",
  },
  warning: {
    dot: "bg-warning",
    text: "text-warning",
    badge: "status-warning border-warning/20",
    panel: "border-warning/30 bg-warning-muted",
  },
  error: {
    dot: "bg-error",
    text: "text-error",
    badge: "status-error border-error/20",
    panel: "border-error/30 bg-error-muted",
  },
} as const;

function formatCost(value: number | null) {
  if (value === null) return "—";
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

function formatLatency(value?: number) {
  if (value === undefined) return "Pending";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const Dashboard: Component = () => {
  const navigate = useNavigate();

  onMount(() => {
    analyticsStore.refresh();
  });

  const activePreset = createMemo(() => {
    const presets = presetStore.presets();
    if (!presets) return null;
    return presets.find((p) => p.active) ?? null;
  });

  const proxyState = () => statusCopy[proxyStore.status()];
  const proxyTone = () => statusToneClasses[proxyState().tone];
  const proxyDotPulse = () =>
    proxyStore.status() === "running" || proxyStore.status() === "starting" || proxyStore.status() === "stopping"
      ? "animate-pulse"
      : "";

  const recentRequests = () => requestStore.requests().slice(0, 6);
  const totalRequests = () => requestStore.requests().length;
  const successRate = () => {
    const completed = requestStore.requests().filter((request) => request.statusCode !== undefined);
    if (completed.length === 0) return null;
    const successes = completed.filter((request) => (request.statusCode ?? 0) < 400).length;
    return Math.round((successes / completed.length) * 100);
  };
  const estimatedCost = () => analyticsStore.filteredCost();
  const configuredAccounts = () => (accountStore.accounts() ?? []).filter((account) => account.hasKey).length;
  const totalAccounts = () => accountStore.accounts()?.length ?? 0;
  const proxyBusy = () => proxyStore.loading() || proxyStore.status() === "starting" || proxyStore.status() === "stopping";
  const hasHealthySetup = () => proxyStore.status() === "running" && !!activePreset() && configuredAccounts() > 0;

  return (
    <div class="space-y-5 lg:space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="font-micro uppercase text-text-tertiary">Aether command center</p>
          <h1 class="font-title text-text">Dashboard</h1>
        </div>
        <div class="chip chip-muted self-start sm:self-auto">
          <span class={`h-1.5 w-1.5 rounded-full ${proxyTone().dot} ${proxyDotPulse()}`} />
          <span>{proxyState().label}</span>
        </div>
      </div>

      <section class={`rounded-xl border p-4 shadow-panel sm:p-5 ${proxyTone().panel}`}>
        <div class="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] 2xl:items-center">
          <div class="space-y-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="max-w-[62ch]">
                <div class={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-caption ${proxyTone().badge}`}>
                  <span class={`h-2 w-2 rounded-full ${proxyTone().dot} ${proxyDotPulse()}`} />
                  <span>{proxyState().label}</span>
                </div>
                <h2 class="font-title text-text">{proxyState().title}</h2>
                <p class="mt-2 font-body text-text-secondary">{proxyStore.error() ?? proxyState().description}</p>
              </div>
              <div class="flex flex-wrap gap-2 sm:justify-end">
                <Show
                  when={proxyStore.status() === "running" || proxyStore.status() === "degraded"}
                  fallback={
                    <Button
                      variant="primary"
                      disabled={proxyBusy()}
                      onClick={() => proxyStore.startProxy()}
                      class="min-w-28 text-primary-foreground"
                    >
                      {proxyBusy() ? "Starting" : "Start proxy"}
                    </Button>
                  }
                >
                  <Button variant="ghost" disabled={proxyBusy()} onClick={() => proxyStore.restartProxy()}>
                    Restart
                  </Button>
                  <Button variant="danger" disabled={proxyBusy()} onClick={() => proxyStore.stopProxy()}>
                    {proxyBusy() ? "Stopping" : "Stop"}
                  </Button>
                </Show>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="surface-inset rounded-lg px-3 py-2.5">
                <p class="font-caption text-text-muted">Endpoint</p>
                <code class="mt-1 block truncate font-mono text-primary">localhost:{proxyStore.port()}</code>
              </div>
              <div class="surface-inset rounded-lg px-3 py-2.5">
                <p class="font-caption text-text-muted">Event stream</p>
                <div class="mt-1 flex items-center gap-2">
                  <span class={`h-1.5 w-1.5 rounded-full ${requestStore.streamConnected() ? "bg-success animate-pulse" : "bg-text-tertiary"}`} />
                  <span class={`font-caption ${requestStore.streamConnected() ? "text-success" : "text-text-muted"}`}>
                    {requestStore.streamConnected() ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
              <div class="surface-inset rounded-lg px-3 py-2.5">
                <p class="font-caption text-text-muted">Setup health</p>
                <div class="mt-1 flex items-center gap-2">
                  <span class={`h-1.5 w-1.5 rounded-full ${hasHealthySetup() ? "bg-success" : "bg-warning"}`} />
                  <span class={`font-caption ${hasHealthySetup() ? "text-success" : "text-warning"}`}>
                    {hasHealthySetup() ? "Ready" : "Needs setup"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-border bg-bg-elevated p-4">
            <p class="font-caption text-text-muted">Active preset</p>
            <Show
              when={activePreset()}
              fallback={
                <div class="mt-2 space-y-3">
                  <p class="font-section-header text-text">No preset selected</p>
                  <p class="font-caption text-text-muted">Choose a preset before routing requests.</p>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/presets")}>
                    Open presets
                  </Button>
                </div>
              }
            >
              {(preset) => (
                <div class="mt-2 min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-section-header text-text">{preset().name}</p>
                    <Badge variant="active">Active</Badge>
                  </div>
                  <p class="mt-1 font-caption text-text-muted">
                    {Object.keys(preset().agents).length} agent roles configured
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/presets")} class="mt-3">
                    Manage preset
                  </Button>
                </div>
              )}
            </Show>
          </div>
        </div>
      </section>

      <section class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <button class="focus-ring rounded-lg border border-border-muted bg-bg-surface p-3.5 text-left transition-colors hover:bg-bg-surface-hover" onClick={() => navigate("/monitor")}>
          <p class="font-caption text-text-muted">Traffic</p>
          <p class="mt-2 text-[22px] font-semibold leading-none text-text tabular-nums">{totalRequests()}</p>
          <p class="mt-1 font-caption text-text-muted">Current session</p>
        </button>
        <button class="focus-ring rounded-lg border border-border-muted bg-bg-surface p-3.5 text-left transition-colors hover:bg-bg-surface-hover" onClick={() => navigate("/analytics")}>
          <p class="font-caption text-text-muted">Reliability</p>
          <p class={`mt-2 text-[22px] font-semibold leading-none tabular-nums ${successRate() === null ? "text-text-muted" : (successRate() ?? 0) >= 90 ? "text-success" : (successRate() ?? 0) >= 70 ? "text-warning" : "text-error"}`}>
            {successRate() === null ? "—" : `${successRate()}%`}
          </p>
          <p class="mt-1 font-caption text-text-muted">Completed requests</p>
        </button>
        <button class="focus-ring rounded-lg border border-border-muted bg-bg-surface p-3.5 text-left transition-colors hover:bg-bg-surface-hover" onClick={() => navigate("/analytics")}>
          <p class="font-caption text-text-muted">Spend</p>
          <p class="mt-2 text-[22px] font-semibold leading-none text-text tabular-nums">{formatCost(estimatedCost())}</p>
          <p class="mt-1 font-caption text-text-muted">Filtered analytics</p>
        </button>
        <button class="focus-ring rounded-lg border border-border-muted bg-bg-surface p-3.5 text-left transition-colors hover:bg-bg-surface-hover" onClick={() => navigate("/accounts")}>
          <p class="font-caption text-text-muted">Keys</p>
          <p class="mt-2 text-[22px] font-semibold leading-none text-text tabular-nums">
            {configuredAccounts()}<span class="text-sm font-medium text-text-muted">/{totalAccounts()}</span>
          </p>
          <p class="mt-1 font-caption text-text-muted">Ready to route</p>
        </button>
      </section>

      <div class="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="font-section-header text-text">Live operations</h2>
              <p class="font-caption text-text-muted">Recent traffic through the proxy</p>
            </div>
            <Show when={recentRequests().length > 0}>
              <Button variant="ghost" size="sm" onClick={() => navigate("/monitor")}>
                View monitor
              </Button>
            </Show>
          </div>
          <GlassCard class="!p-0 overflow-hidden">
            <Show
              when={recentRequests().length > 0}
              fallback={
                <div class="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                  <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-bg-surface text-text-muted">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m4.5-6v6m4.5-9.75v9.75M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                    </svg>
                  </div>
                  <p class="font-section-header text-text">No requests yet</p>
                  <p class="mt-1 max-w-[34ch] font-body text-text-muted">
                    Start the proxy and point a local tool at localhost:{proxyStore.port()} to see traffic here.
                  </p>
                </div>
              }
            >
              <div class="divide-y divide-border-muted">
                <For each={recentRequests()}>
                  {(req) => {
                    const statusColor = () => {
                      if (req.inFlight || !req.statusCode) return "bg-warning animate-pulse";
                      return req.statusCode < 400 ? "bg-success" : "bg-error";
                    };
                    const statusClass = () => {
                      if (req.inFlight || !req.statusCode) return "status-warning";
                      return req.statusCode < 400 ? "status-success" : "status-error";
                    };
                    return (
                      <button
                        class="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-surface-hover sm:px-5"
                        onClick={() => {
                          requestStore.selectRequest(req.id);
                          navigate("/monitor");
                        }}
                      >
                        <div class="flex min-w-0 items-center gap-3">
                          <span class={`h-2 w-2 shrink-0 rounded-full ${statusColor()}`} />
                          <div class="min-w-0">
                            <div class="flex min-w-0 items-center gap-2">
                              <span class="font-mono text-xs text-text-muted">{req.method}</span>
                              <span class="truncate font-body text-text">{req.endpoint}</span>
                            </div>
                            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-caption text-text-muted">
                              <span>{formatTime(req.timestamp)}</span>
                              <span aria-hidden="true">•</span>
                              <span>{req.provider || "Unknown provider"}</span>
                              <span aria-hidden="true">•</span>
                              <span>{formatLatency(req.latencyMs)}</span>
                            </div>
                          </div>
                        </div>
                        <span class={`shrink-0 rounded-md px-2 py-1 font-mono text-xs ${statusClass()}`}>
                          {req.statusCode ?? "Live"}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </GlassCard>
        </section>

        <section class="space-y-5">
          <Suspense fallback={<GlassCard><p class="font-body text-text-muted">Loading preset...</p></GlassCard>}>
            <GlassCard active={!!activePreset()}>
              <div class="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 class="font-section-header text-text">Preset routing</h2>
                  <p class="font-caption text-text-muted">Models assigned to each agent role</p>
                </div>
                <Show when={activePreset()}>
                  <Badge variant="active">Active</Badge>
                </Show>
              </div>
              <Show
                when={activePreset()}
                fallback={
                  <div class="rounded-lg border border-border bg-bg-surface p-4">
                    <p class="font-body text-text">No active preset</p>
                    <p class="mt-1 font-caption text-text-muted">Pick a preset so Aether knows which models to route to.</p>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/presets")} class="mt-3">
                      Choose preset
                    </Button>
                  </div>
                }
              >
                {(preset) => (
                  <div class="space-y-2">
                    <p class="truncate text-base font-semibold text-text">{preset().name}</p>
                    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <For each={Object.entries(preset().agents)}>
                        {([role, agent]) => {
                          const modelParts = () => agent.model ? splitModelId(agent.model) : ["", ""];
                          return (
                            <div class="min-w-0 rounded-lg border border-border-muted bg-bg-surface px-3 py-2">
                              <p class="font-caption capitalize text-text-muted">{role}</p>
                              <p class="mt-1 truncate font-mono text-xs text-text-secondary">
                                {modelParts()[1] || "No model assigned"}
                              </p>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </Show>
            </GlassCard>
          </Suspense>

          <div>
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h2 class="font-section-header text-text">Provider accounts</h2>
                <p class="font-caption text-text-muted">Key readiness for configured providers</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/accounts")}>
                Manage
              </Button>
            </div>
            <Suspense fallback={<GlassCard><p class="font-body text-text-muted">Loading accounts...</p></GlassCard>}>
              <Show
                when={(accountStore.accounts()?.length ?? 0) > 0}
                fallback={
                  <GlassCard>
                    <p class="font-body text-text">No provider accounts yet</p>
                    <p class="mt-1 font-caption text-text-muted">Add a provider key to make routing useful.</p>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/accounts")} class="mt-3">
                      Add account
                    </Button>
                  </GlassCard>
                }
              >
                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <For each={accountStore.accounts()}>
                    {(account) => {
                      const meta = () => accountStore.getProviderMeta(account.provider);
                      return (
                        <button
                          class="surface-elevated focus-ring flex min-w-0 items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-bg-surface-hover"
                          onClick={() => navigate("/accounts")}
                        >
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-surface-strong">
                            <Show
                              when={meta().logo}
                              fallback={<span class="font-micro text-text-secondary">{meta().icon}</span>}
                            >
                              <img src={meta().logo} alt="" class="h-5 w-5 object-contain" />
                            </Show>
                          </div>
                          <div class="min-w-0 flex-1">
                            <p class="truncate font-body text-text">{meta().name}</p>
                            <div class="mt-0.5 flex items-center gap-1.5">
                              <span class={`h-1.5 w-1.5 rounded-full ${account.hasKey ? "bg-success" : "bg-warning"}`} />
                              <p class={`font-caption ${account.hasKey ? "text-success" : "text-warning"}`}>
                                {account.hasKey ? "Key configured" : "Needs key"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
