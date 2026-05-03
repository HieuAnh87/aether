import type { Component } from "solid-js";
import { For, Show, Suspense } from "solid-js";
import { useNavigate } from "@solidjs/router";
import GlassCard from "../components/GlassCard";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { presetStore, splitModelId } from "../stores/presetStore";
import { proxyStore } from "../stores/proxyStore";
import { requestStore } from "../stores/requestStore";
import { accountStore } from "../stores/accountStore";

const Dashboard: Component = () => {
  const navigate = useNavigate();

  // Active preset info
  const activePreset = () => {
    const presets = presetStore.presets();
    if (!presets) return null;
    return presets.find((p) => p.active) ?? null;
  };

  // Proxy status styling
  const proxyStatusColor = () => {
    switch (proxyStore.status()) {
      case "running": return "text-success";
      case "stopped":
      case "crashed": return "text-error";
      default: return "text-warning";
    }
  };

  const proxyDotColor = () => {
    switch (proxyStore.status()) {
      case "running": return "bg-success";
      case "stopped":
      case "crashed": return "bg-error";
      default: return "bg-warning";
    }
  };

  const proxyDotPulse = () =>
    proxyStore.status() === "running" ? "animate-pulse" : "";

  // Recent requests (last 5)
  const recentRequests = () => {
    const all = requestStore.requests();
    return all.slice(0, 5);
  };

  // Request stats
  const totalRequests = () => requestStore.requests().length;
  const successRate = () => {
    const all = requestStore.requests();
    if (all.length === 0) return null;
    const successes = all.filter((r) => r.statusCode && r.statusCode < 400).length;
    return Math.round((successes / all.length) * 100);
  };
  const avgLatency = () => {
    const all = requestStore.requests().filter((r) => r.latencyMs);
    if (all.length === 0) return null;
    const sum = all.reduce((acc, r) => acc + (r.latencyMs ?? 0), 0);
    return Math.round(sum / all.length);
  };

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="font-title text-text">Dashboard</h1>
        {/* Live indicator */}
        <div class="flex items-center gap-2">
          <span class={`inline-block h-1.5 w-1.5 rounded-full ${proxyDotColor()} ${proxyDotPulse()}`} />
          <span class="font-caption text-text-muted capitalize">{proxyStore.status()}</span>
        </div>
      </div>

      {/* Quick stats row */}
      <div class="grid grid-cols-3 gap-3">
        {/* Total requests */}
        <GlassCard class="!p-4 cursor-pointer hover:border-white/[0.15] transition-colors" onClick={() => navigate("/analytics")}>
          <p class="font-caption text-text-muted mb-1">Total Requests</p>
          <p class="text-2xl font-semibold text-text leading-none">{totalRequests()}</p>
          <p class="font-caption text-text-muted mt-1">this session</p>
        </GlassCard>

        {/* Success rate */}
        <GlassCard class="!p-4 cursor-pointer hover:border-white/[0.15] transition-colors" onClick={() => navigate("/analytics")}>
          <p class="font-caption text-text-muted mb-1">Success Rate</p>
          <Show when={successRate() !== null} fallback={
            <p class="text-2xl font-semibold text-text-muted leading-none">—</p>
          }>
            <p class={`text-2xl font-semibold leading-none ${(successRate() ?? 0) >= 90 ? "text-success" : (successRate() ?? 0) >= 70 ? "text-warning" : "text-error"}`}>
              {successRate()}%
            </p>
          </Show>
          <p class="font-caption text-text-muted mt-1">of all requests</p>
        </GlassCard>

        {/* Avg latency */}
        <GlassCard class="!p-4 cursor-pointer hover:border-white/[0.15] transition-colors" onClick={() => navigate("/analytics")}>
          <p class="font-caption text-text-muted mb-1">Avg Latency</p>
          <Show when={avgLatency() !== null} fallback={
            <p class="text-2xl font-semibold text-text-muted leading-none">—</p>
          }>
            <p class="text-2xl font-semibold text-text leading-none">{avgLatency()}</p>
          </Show>
          <p class="font-caption text-text-muted mt-1">milliseconds</p>
        </GlassCard>
      </div>

      {/* Main cards row: Active Preset + Proxy Status */}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Active Preset Card */}
        <Suspense fallback={<GlassCard><p class="font-body text-text-muted">Loading...</p></GlassCard>}>
          <GlassCard active={!!activePreset()}>
            <div class="flex items-start justify-between mb-4">
              <div>
                <h2 class="font-section-header text-text">Active Preset</h2>
                <p class="font-caption text-text-muted mt-0.5">Currently applied model configuration</p>
              </div>
              <Show when={activePreset()}>
                <Badge variant="active">ACTIVE</Badge>
              </Show>
            </div>
            <Show
              when={activePreset()}
              fallback={
                <div class="flex flex-col items-center justify-center py-6">
                  <svg class="mb-3 h-8 w-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                  <p class="font-body text-text-muted text-center">No preset active</p>
                </div>
              }
            >
              {(preset) => (
                <div>
                  <p class="text-base font-semibold text-text mb-3">{preset().name}</p>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                    <For each={Object.entries(preset().agents)}>
                      {([role, agent]) => (
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="font-caption text-text-muted capitalize shrink-0">{role}:</span>
                          <span class="font-caption text-text-secondary truncate">
                            {agent.model ? splitModelId(agent.model)[1] : "—"}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </Show>
          </GlassCard>
        </Suspense>

        {/* Proxy Status Card */}
        <GlassCard>
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="font-section-header text-text">Proxy Status</h2>
              <p class="font-caption text-text-muted mt-0.5">CLIProxyAPI sidecar</p>
            </div>
            <div class="flex items-center gap-2">
              <span class={`inline-block h-2 w-2 rounded-full ${proxyDotColor()} ${proxyDotPulse()}`} />
              <span class={`font-caption font-medium capitalize ${proxyStatusColor()}`}>
                {proxyStore.status()}
              </span>
            </div>
          </div>

          <Show when={proxyStore.status() === "running"}>
            <div class="space-y-2.5">
              <div class="flex items-center justify-between rounded-md bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <span class="font-caption text-text-muted">Endpoint</span>
                <code class="font-mono text-xs text-primary">localhost:{proxyStore.port()}</code>
              </div>
              <div class="flex items-center justify-between rounded-md bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <span class="font-caption text-text-muted">Stream</span>
                <div class="flex items-center gap-1.5">
                  <span class={`inline-block h-1.5 w-1.5 rounded-full ${requestStore.streamConnected() ? "bg-success animate-pulse" : "bg-text-muted"}`} />
                  <span class={`font-caption ${requestStore.streamConnected() ? "text-success" : "text-text-muted"}`}>
                    {requestStore.streamConnected() ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
            </div>
          </Show>

          <Show when={proxyStore.status() === "stopped" || proxyStore.status() === "crashed"}>
            <div class="flex flex-col items-center justify-center py-4 gap-3">
              <p class="font-body text-text-muted text-center">Proxy is not running</p>
              <Button variant="primary" size="sm" onClick={() => proxyStore.startProxy()}>
                Start Proxy
              </Button>
            </div>
          </Show>
        </GlassCard>
      </div>

      {/* Provider Accounts Summary */}
      <div>
        <h2 class="font-section-header text-text-secondary mb-3">Provider Accounts</h2>
        <Suspense fallback={<GlassCard><p class="font-body text-text-muted">Loading...</p></GlassCard>}>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <For each={accountStore.accounts()}>
              {(account) => {
                const meta = () => accountStore.getProviderMeta(account.provider);
                return (
                  <GlassCard class="!p-4 transition-all duration-150 hover:border-white/[0.12]">
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ "background-color": meta().color }}
                      >
                        <img
                          src={meta().logo}
                          alt={meta().name}
                          class="h-5 w-5 object-contain invert"
                        />
                      </div>
                      <div class="min-w-0">
                        <p class="font-body text-text truncate">{meta().name}</p>
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <span class={`inline-block h-1.5 w-1.5 rounded-full ${account.hasKey ? "bg-success" : "bg-text-muted"}`} />
                          <p class="font-caption text-text-muted">
                            {account.hasKey ? "Key configured" : "Not configured"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                );
              }}
            </For>
          </div>
        </Suspense>
      </div>

      {/* Recent Requests */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-section-header text-text-secondary">Recent Requests</h2>
          <Show when={recentRequests().length > 0}>
            <span class="font-caption text-text-muted">{totalRequests()} total</span>
          </Show>
        </div>
        <GlassCard class="!p-0 overflow-hidden">
          <Show
            when={recentRequests().length > 0}
            fallback={
              <p class="font-body text-text-muted py-8 text-center">No requests recorded yet</p>
            }
          >
            <div class="divide-y divide-border">
              <For each={recentRequests()}>
                {(req) => {
                  const statusColor = () => {
                    if (!req.statusCode) return "bg-primary animate-pulse";
                    return req.statusCode < 400 ? "bg-success" : "bg-error";
                  };
                  const statusText = () => {
                    if (!req.statusCode) return "";
                    return String(req.statusCode);
                  };
                  return (
                    <div class="flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.02]">
                      <div class="flex items-center gap-3 min-w-0">
                        <span class={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusColor()}`} />
                        <span class="font-mono text-xs text-text-secondary w-12 shrink-0">{req.method}</span>
                        <span class="font-body text-text truncate max-w-[180px]">{req.endpoint}</span>
                      </div>
                      <div class="flex items-center gap-3 shrink-0 ml-3">
                        <Show when={statusText()}>
                          <span class={`font-mono text-xs px-1.5 py-0.5 rounded ${req.statusCode && req.statusCode < 400 ? "text-success bg-success/10" : "text-error bg-error/10"}`}>
                            {statusText()}
                          </span>
                        </Show>
                        <Show when={req.latencyMs}>
                          <span class="font-caption text-text-muted w-16 text-right">{req.latencyMs}ms</span>
                        </Show>
                        <Show when={req.provider}>
                          <span class="font-caption text-text-muted hidden sm:block">{req.provider}</span>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </GlassCard>
      </div>
    </div>
  );
};

export default Dashboard;
