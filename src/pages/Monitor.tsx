import type { Component } from "solid-js";
import { Show, onMount, onCleanup } from "solid-js";
import { requestStore } from "../stores/requestStore";
import RequestFilterBar from "../components/RequestFilterBar";
import RequestTable from "../components/RequestTable";
import RequestDetailPanel from "../components/RequestDetailPanel";

function getFilterSummary(): string {
  const parts: string[] = [];

  function pretty(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  const provider = requestStore.filterProvider();
  if (provider) {
    parts.push(pretty(provider));
  }

  const status = requestStore.filterStatus();
  if (status !== "all") {
    parts.push(pretty(status));
  }

  const search = requestStore.searchQuery().trim();
  if (search) {
    parts.push(`search "${search}"`);
  }

  return parts.length > 0 ? parts.join(" · ") : "All requests";
}

const Monitor: Component = () => {
  onMount(() => {
    requestStore.startStream();
  });

  onCleanup(() => requestStore.cleanup());

  const totalRequests = () => requestStore.requests().length;
  const visibleRequests = () => requestStore.filteredRequests().length;
  const hasFilters = () =>
    requestStore.filterProvider() !== null || requestStore.filterStatus() !== "all" || requestStore.searchQuery().trim().length > 0;
  const connectionLabel = () => {
    if (requestStore.streamConnected()) return "Live";
    return requestStore.streamError() ? "Paused" : "Connecting";
  };

  const connectionTone = () => {
    if (requestStore.streamConnected()) {
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    }

    return requestStore.streamError()
      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
      : "border-border bg-bg-surface text-text-secondary";
  };

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-bg-elevated text-text">
      <header class="shrink-0 border-b border-border bg-bg-surface/95 px-5 py-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-section-header text-[15px] text-text">Monitor</h1>
              <span class={`inline-flex items-center rounded-full border px-2.5 py-1 font-caption text-[11px] ${connectionTone()}`}>
                <span
                  class={`mr-1.5 h-2 w-2 rounded-full ${requestStore.streamConnected() ? "bg-emerald-400" : requestStore.streamError() ? "bg-amber-400" : "bg-border"}`}
                  aria-hidden="true"
                />
                {connectionLabel()}
              </span>
              <span class="inline-flex items-center rounded-full border border-border bg-bg-elevated px-2.5 py-1 font-caption text-[11px] text-text-secondary tabular-nums">
                {visibleRequests()}/{totalRequests()} shown
              </span>
            </div>

            <p class="max-w-2xl font-body text-[13px] leading-5 text-text-secondary">
              Live proxy requests for quick failure checks and latency triage.
            </p>

            <div class="flex flex-wrap items-center gap-2 font-caption text-[11px] text-text-muted">
              <span class="uppercase tracking-[0.14em] text-text-tertiary">Session</span>
              <span>{getFilterSummary()}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Show when={hasFilters()}>
              <button
                class="inline-flex h-8 items-center rounded-md border border-border bg-transparent px-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:ring-offset-0"
                onClick={() => {
                  requestStore.setFilterProvider(null);
                  requestStore.setFilterStatus("all");
                  requestStore.setSearchQuery("");
                }}
              >
                Reset filters
              </button>
            </Show>

            <button
              class="inline-flex h-8 items-center rounded-md border border-border bg-transparent px-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-bg-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:ring-offset-0"
              onClick={() => requestStore.clearRequests()}
            >
              Clear stream
            </button>
          </div>
        </div>
      </header>

      <Show when={!requestStore.streamConnected() && requestStore.streamError()}>
        <div class="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p class="font-caption text-[12px] leading-5 text-amber-100">
              Live updates are paused. CLIProxyAPI event streaming is not available.
              <Show when={requestStore.streamError()}>
                {(error) => <span class="text-amber-100/70"> {error()}</span>}
              </Show>
            </p>

            <button
              class="inline-flex h-8 items-center rounded-md border border-amber-500/25 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-50 transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:ring-offset-0"
              onClick={() => requestStore.startStream()}
            >
              Reconnect
            </button>
          </div>
        </div>
      </Show>

      <RequestFilterBar />

      <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div class="min-h-0 flex-1 overflow-hidden border-b border-border lg:border-b-0 lg:border-r lg:border-border">
          <RequestTable />
        </div>

        <Show when={requestStore.selectedRequestId()}>
          <aside class="min-h-0 w-full overflow-hidden lg:w-[420px] lg:min-w-[420px]">
            <RequestDetailPanel />
          </aside>
        </Show>
      </div>
    </div>
  );
};

export default Monitor;
