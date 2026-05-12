import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { requestStore } from "../stores/requestStore";

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "text-violet-300",
  openai: "text-emerald-300",
  google: "text-amber-300",
  vertexai: "text-sky-200",
};

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });
}

function getStatusDotClass(req: { statusCode?: number; inFlight: boolean }): string {
  if (req.inFlight) return "bg-amber-400 animate-pulse";
  if (!req.statusCode) return "bg-border";
  if (req.statusCode >= 200 && req.statusCode < 300) return "bg-emerald-400";
  if (req.statusCode >= 400 && req.statusCode < 500) return "bg-amber-400";
  if (req.statusCode >= 500) return "bg-rose-400";
  return "bg-border";
}

function getProviderColorClass(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? "text-text-secondary";
}

function getStatusLabel(req: { statusCode?: number; inFlight: boolean }): string {
  if (req.inFlight) return "Sending";
  if (!req.statusCode) return "Pending";
  return String(req.statusCode);
}

function handleRowKeyDown(event: KeyboardEvent, id: string): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  requestStore.selectRequest(id);
}

const RequestTable: Component = () => {
  const filtered = () => requestStore.filteredRequests();
  const total = () => requestStore.requests().length;
  const provider = () => requestStore.filterProvider();
  const status = () => requestStore.filterStatus();
  const query = () => requestStore.searchQuery().trim();
  const hasFilters = () => provider() !== null || status() !== "all" || query().length > 0;
  const selectedId = () => requestStore.selectedRequestId();

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-bg-surface">
      <Show
        when={filtered().length > 0}
        fallback={
          <div class="flex h-full min-h-0 items-center justify-center px-6 py-10 text-center">
            <div class="max-w-md space-y-4">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted">
                <span aria-hidden="true">⌘</span>
              </div>
              <div class="space-y-1">
                <p class="font-section-header text-[14px] text-text">
                  {total() > 0 ? "No matching requests" : "Waiting for live requests"}
                </p>
                <p class="font-body text-[13px] leading-5 text-text-secondary">
                  {total() > 0
                    ? "Try a broader search or reset the filters."
                    : "Make a request in your AI tool and it will appear here."}
                </p>
              </div>
              <Show when={hasFilters()}>
                <button
                  type="button"
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
            </div>
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[920px] border-collapse text-left">
            <caption class="sr-only">Live request stream</caption>
            <thead class="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur-0">
              <tr class="border-b border-border/80">
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Time</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Method</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary w-full">Endpoint</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Provider</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Status</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Latency</th>
                <th class="px-3 py-2.5 font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary whitespace-nowrap">Tokens</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/70">
              <For each={filtered()}>
                {(req) => {
                  const selected = () => selectedId() === req.id;
                  const statusLabel = () => getStatusLabel(req);
                  const latencyLabel = () => (req.latencyMs != null ? `${req.latencyMs} ms` : "-");
                  const tokenLabel = () => (req.tokensUsed != null ? req.tokensUsed.toLocaleString() : "-");

                  return (
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-selected={selected()}
                      aria-label={`${req.method} ${req.endpoint} ${statusLabel()}`}
                      class={`group cursor-pointer outline-none transition-colors focus-visible:bg-amber-500/10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-500/30 ${
                        selected()
                          ? "bg-amber-500/10 shadow-[inset_0_0_0_1px_rgba(217,119,6,0.26)]"
                          : "hover:bg-bg-elevated"
                      }`}
                      onClick={() => requestStore.selectRequest(req.id)}
                      onKeyDown={(event) => handleRowKeyDown(event, req.id)}
                    >
                      <td class="px-3 py-3 font-mono text-[12px] tabular-nums text-text-muted whitespace-nowrap">
                        {formatTime(req.timestamp)}
                      </td>
                      <td class="px-3 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-text whitespace-nowrap">
                        {req.method}
                      </td>
                      <td class="px-3 py-3">
                        <div class="min-w-0">
                          <p class="truncate font-caption text-[12px] text-text" title={req.endpoint}>
                            {req.endpoint}
                          </p>
                        </div>
                      </td>
                      <td class={`px-3 py-3 font-caption text-[12px] capitalize whitespace-nowrap ${getProviderColorClass(req.provider)}`}>
                        {req.provider}
                      </td>
                      <td class="px-3 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <span class={`h-2 w-2 rounded-full ${getStatusDotClass(req)}`} aria-hidden="true" />
                          <span class="font-caption text-[12px] tabular-nums text-text-secondary">{statusLabel()}</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 font-caption text-[12px] tabular-nums text-text-secondary whitespace-nowrap">
                        {latencyLabel()}
                      </td>
                      <td class="px-3 py-3 font-caption text-[12px] tabular-nums text-text-secondary whitespace-nowrap">
                        {tokenLabel()}
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default RequestTable;
