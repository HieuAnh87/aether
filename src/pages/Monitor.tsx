import type { Component } from "solid-js";
import { Show, onMount, onCleanup } from "solid-js";
import { requestStore } from "../stores/requestStore";
import RequestFilterBar from "../components/RequestFilterBar";
import RequestTable from "../components/RequestTable";
import RequestDetailPanel from "../components/RequestDetailPanel";

const Monitor: Component = () => {
  onMount(() => {
    requestStore.startStream();
    onCleanup(() => requestStore.cleanup());
  });

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-elevated shrink-0">
        <div class="flex items-center gap-3">
          <h1 class="font-title text-text">Request Monitor</h1>
          {/* Connection status indicator */}
          <div class="flex items-center gap-1.5">
            <span
              class={`inline-block w-2 h-2 rounded-full ${
                requestStore.streamConnected() ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span class="font-caption text-text-secondary text-xs">
              {requestStore.streamConnected() ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Clear button */}
        <button
          class="inline-flex items-center h-7 px-3 rounded-md border border-border bg-transparent text-text-secondary text-xs font-medium hover:bg-bg-elevated transition-colors"
          onClick={() => requestStore.clearRequests()}
        >
          Clear
        </button>
      </div>

      {/* Stream error fallback */}
      <Show when={!requestStore.streamConnected() && requestStore.streamError()}>
        <div class="px-6 py-3 bg-error/10 border-b border-error/30 shrink-0">
          <p class="font-caption text-error text-xs">
            Request monitoring requires CLIProxyAPI v2.0+ with event streaming support.
            <Show when={requestStore.streamError()}>
              {" "}
              <span class="text-text-muted">({requestStore.streamError()})</span>
            </Show>
          </p>
        </div>
      </Show>

      {/* Filter bar */}
      <RequestFilterBar />

      {/* Main content area */}
      <div class="flex flex-1 overflow-hidden">
        {/* Request table */}
        <div class="flex-1 overflow-hidden">
          <RequestTable />
        </div>

        {/* Detail panel — 300px wide, only shown when a request is selected */}
        <Show when={requestStore.selectedRequestId()}>
          <div class="w-[300px] shrink-0 overflow-hidden">
            <RequestDetailPanel />
          </div>
        </Show>
      </div>
    </div>
  );
};

export default Monitor;
