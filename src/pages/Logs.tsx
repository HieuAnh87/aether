import type { Component } from "solid-js";
import GlassCard from "../components/GlassCard";

const Logs: Component = () => {
  return (
    <div class="space-y-6">
      <div>
        <h1 class="font-title text-text">Logs</h1>
        <p class="font-body text-text-secondary mt-1">Application and proxy event logs.</p>
      </div>

      <GlassCard class="!p-0 overflow-hidden">
        {/* Log viewer toolbar placeholder */}
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-white/[0.02]">
          <div class="flex items-center gap-2">
            <div class="h-3.5 w-16 rounded bg-white/[0.06] animate-pulse" />
            <div class="h-3.5 w-12 rounded bg-white/[0.06] animate-pulse" />
            <div class="h-3.5 w-20 rounded bg-white/[0.06] animate-pulse" />
          </div>
          <div class="h-3.5 w-10 rounded bg-white/[0.06] animate-pulse" />
        </div>

        {/* Empty state */}
        <div class="flex flex-col items-center justify-center py-16 gap-4">
          {/* Terminal / log icon */}
          <svg
            class="h-14 w-14 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <rect x="2" y="3" width="20" height="16" rx="2" stroke-opacity="0.4" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 8l3 3-3 3M12 14h4"
            />
          </svg>
          <div class="text-center">
            <h2 class="font-section-header text-text">Coming Soon</h2>
            <p class="font-body text-text-muted mt-2 max-w-sm">
              Structured proxy logs, error traces, and application events will be streamed here in real time.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default Logs;
