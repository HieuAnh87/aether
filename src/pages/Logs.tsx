import { type Component, For, Show, createEffect } from "solid-js";
import { logStore, type LogEntry } from "../stores/logStore";

// ---------------------------------------------------------------------------
// Level metadata
// ---------------------------------------------------------------------------

const LEVEL_META: Record<number, { label: string; badgeClass: string }> = {
  1: { label: "TRC", badgeClass: "text-text-tertiary bg-white/[0.04]" },
  2: { label: "DBG", badgeClass: "text-primary bg-primary-muted" },
  3: { label: "INF", badgeClass: "text-success bg-success-muted" },
  4: { label: "WRN", badgeClass: "text-warning bg-warning-muted" },
  5: { label: "ERR", badgeClass: "text-error bg-error-muted" },
};

function levelMeta(level: number) {
  return LEVEL_META[level] ?? { label: "???", badgeClass: "text-text-tertiary bg-white/[0.04]" };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// LogRow
// ---------------------------------------------------------------------------

const LogRow: Component<{ entry: LogEntry }> = (props) => {
  const meta = () => levelMeta(props.entry.level);

  return (
    <div class="flex items-baseline gap-2 px-3 py-0.5 hover:bg-white/[0.03] transition-colors font-mono text-xs leading-5 select-text">
      <span class="text-text-tertiary shrink-0 tabular-nums">{formatTime(props.entry.ts)}</span>
      <span
        class={`shrink-0 inline-flex items-center justify-center w-[30px] rounded px-0.5 py-px text-[10px] font-medium leading-none ${meta().badgeClass}`}
      >
        {meta().label}
      </span>
      <span class="shrink-0 text-text-tertiary text-[10px] leading-none border border-white/10 rounded px-1 py-px">
        {props.entry.source}
      </span>
      <span class="text-text-secondary break-all min-w-0">{props.entry.message}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconPause = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="4" height="12" rx="1" />
    <rect x="9" y="2" width="4" height="12" rx="1" />
  </svg>
);

const IconPlay = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5l10 5.5-10 5.5V2.5z" />
  </svg>
);

const IconScrollBottom = () => (
  <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M8 3v7m0 0l-3-3m3 3l3-3M3 13h10" />
  </svg>
);

// ---------------------------------------------------------------------------
// Logs Page
// ---------------------------------------------------------------------------

const Logs: Component = () => {
  let bottomRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom when new entries arrive (only when not paused).
  // Track raw logs().length — not filteredLogs() — so filter/search changes
  // don't trigger an unexpected scroll-to-bottom while the user is reading.
  createEffect(() => {
    logStore.logs().length; // track raw count only
    if (!logStore.paused()) {
      bottomRef?.scrollIntoView({ behavior: "smooth" });
    }
  });

  function scrollToBottom() {
    bottomRef?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div class="space-y-6">
      <div>
        <h1 class="font-title text-text">Logs</h1>
        <p class="font-body text-text-secondary mt-1">Application and proxy event logs.</p>
      </div>

      <div class="glass rounded-lg overflow-hidden flex flex-col" style={{ "max-height": "calc(100vh - 160px)" }}>
        {/* Toolbar */}
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-white/[0.02] shrink-0">
          {/* Left: filter toggle + search */}
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              <button
                onClick={() => logStore.setLogFilter("warn")}
                class={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  logStore.logFilter() === "warn"
                    ? "bg-white/[0.1] text-text"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Warn+Error
              </button>
              <button
                onClick={() => logStore.setLogFilter("all")}
                class={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  logStore.logFilter() === "all"
                    ? "bg-white/[0.1] text-text"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                All
              </button>
            </div>

            {/* Search */}
            <div class="relative flex items-center">
              <svg class="absolute left-2 w-3 h-3 text-text-tertiary pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="6.5" cy="6.5" r="4" />
                <path stroke-linecap="round" d="M10.5 10.5l3 3" />
              </svg>
              <input
                type="text"
                placeholder="Filter logs…"
                value={logStore.searchQuery()}
                onInput={(e) => logStore.setSearchQuery(e.currentTarget.value)}
                class="pl-6 pr-2 py-1 rounded bg-white/[0.06] border border-border text-xs text-text placeholder:text-text-tertiary focus:outline-none focus:border-primary/50 w-40 transition-colors"
              />
            </div>
          </div>

          {/* Right: controls */}
          <div class="flex items-center gap-1">
            <span class="text-xs text-text-tertiary tabular-nums mr-2">
              {logStore.filteredLogs().length} entries
            </span>

            {/* Scroll to bottom */}
            <button
              onClick={scrollToBottom}
              title="Scroll to bottom"
              class="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-tertiary hover:text-text-secondary hover:bg-white/[0.06] transition-colors"
            >
              <IconScrollBottom />
            </button>

            {/* Play / Pause */}
            <button
              onClick={() => logStore.togglePause()}
              title={logStore.paused() ? "Resume live log" : "Pause live log"}
              class={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                logStore.paused()
                  ? "text-warning hover:bg-warning-muted"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-white/[0.06]"
              }`}
            >
              <Show when={logStore.paused()} fallback={<IconPause />}>
                <IconPlay />
              </Show>
              <span>{logStore.paused() ? "Paused" : "Live"}</span>
            </button>

            {/* Clear */}
            <button
              onClick={() => { logStore.clearLogs(); logStore.setSearchQuery(""); }}
              class="px-2 py-1 rounded text-xs text-text-tertiary hover:text-text-secondary hover:bg-white/[0.06] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Log list */}
        <div class="flex-1 overflow-y-auto py-1 min-h-0">
          <Show
            when={logStore.filteredLogs().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-16 gap-4">
                <svg
                  class="h-12 w-12 text-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1"
                >
                  <rect x="2" y="3" width="20" height="16" rx="2" stroke-opacity="0.4" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 8l3 3-3 3M12 14h4" />
                </svg>
                <div class="text-center">
                  <p class="font-body text-text-secondary">No log entries</p>
                  <p class="font-body text-text-muted mt-1 text-xs max-w-xs">
                    <Show
                      when={logStore.logFilter() === "warn"}
                      fallback="Events will appear here as the app runs."
                    >
                      Switch to "All" to see Info-level entries, or wait for a warning or error.
                    </Show>
                  </p>
                </div>
              </div>
            }
          >
            <For each={logStore.filteredLogs()}>
              {(entry) => <LogRow entry={entry} />}
            </For>
          </Show>

          {/* Auto-scroll sentinel */}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

export default Logs;
