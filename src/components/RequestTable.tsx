import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { requestStore } from "../stores/requestStore";

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "text-purple-400",
  openai: "text-emerald-400",
  google: "text-blue-400",
  vertexai: "text-violet-400",
};

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });
}

function getStatusDotClass(req: { statusCode?: number; inFlight: boolean }): string {
  if (req.inFlight) return "bg-blue-500 animate-pulse";
  if (!req.statusCode) return "bg-border";
  if (req.statusCode >= 200 && req.statusCode < 300) return "bg-green-500";
  if (req.statusCode >= 400 && req.statusCode < 500) return "bg-amber-500";
  if (req.statusCode >= 500) return "bg-red-500";
  return "bg-border";
}

function getProviderColorClass(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? "text-text-secondary";
}

const RequestTable: Component = () => {
  const filtered = () => requestStore.filteredRequests();
  const selectedId = () => requestStore.selectedRequestId();

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <Show
        when={filtered().length > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center">
            <p class="font-body text-text-muted">No requests yet</p>
          </div>
        }
      >
        <div class="overflow-auto flex-1">
          <table class="w-full border-collapse text-left">
            <thead class="sticky top-0 z-10 bg-bg-elevated">
              <tr class="border-b border-border">
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Time</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Method</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium w-full">Endpoint</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Provider</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Status</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Latency</th>
                <th class="px-3 py-2 font-caption text-text-secondary font-medium whitespace-nowrap">Tokens</th>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(req) => (
                  <tr
                    class={`border-b border-border cursor-pointer transition-colors hover:bg-bg-elevated ${
                      selectedId() === req.id ? "bg-primary/10" : ""
                    }`}
                    onClick={() => requestStore.selectRequest(req.id)}
                  >
                    <td class="px-3 py-2 font-mono font-caption text-text-muted whitespace-nowrap">
                      {formatTime(req.timestamp)}
                    </td>
                    <td class="px-3 py-2 font-mono font-caption text-text whitespace-nowrap uppercase">
                      {req.method}
                    </td>
                    <td class="px-3 py-2 font-caption text-text truncate max-w-xs" title={req.endpoint}>
                      {req.endpoint}
                    </td>
                    <td class={`px-3 py-2 font-caption whitespace-nowrap capitalize ${getProviderColorClass(req.provider)}`}>
                      {req.provider}
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap">
                      <div class="flex items-center gap-1.5">
                        <span class={`inline-block w-2 h-2 rounded-full ${getStatusDotClass(req)}`} />
                        <span class="font-caption text-text-secondary">
                          {req.inFlight ? "…" : (req.statusCode ?? "-")}
                        </span>
                      </div>
                    </td>
                    <td class="px-3 py-2 font-caption text-text-secondary whitespace-nowrap">
                      {req.latencyMs != null ? `${req.latencyMs}ms` : "-"}
                    </td>
                    <td class="px-3 py-2 font-caption text-text-secondary whitespace-nowrap">
                      {req.tokensUsed != null ? req.tokensUsed.toLocaleString() : "-"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default RequestTable;
