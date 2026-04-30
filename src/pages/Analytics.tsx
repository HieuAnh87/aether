import type { Component } from "solid-js";
import GlassCard from "../components/GlassCard";

const Analytics: Component = () => {
  return (
    <div class="space-y-6">
      <div>
        <h1 class="font-title text-text">Analytics</h1>
        <p class="font-body text-text-secondary mt-1">Insights and usage trends across your AI providers.</p>
      </div>

      <GlassCard>
        <div class="flex flex-col items-center justify-center py-16 gap-4">
          {/* Chart icon */}
          <svg
            class="h-14 w-14 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 13.5l5-5 4 4 5-6.5M3 21h18M21 3v18"
              opacity="0.4"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 13.5l5-5 4 4 5-6.5"
            />
          </svg>
          <div class="text-center">
            <h2 class="font-section-header text-text">Coming Soon</h2>
            <p class="font-body text-text-muted mt-2 max-w-sm">
              Request volume charts, latency trends, token usage breakdowns, and provider cost analysis — all in one place.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Placeholder stat cards */}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["Requests / Day", "Tokens Used", "Est. Cost"] as const).map((label) => (
          <GlassCard class="!p-4">
            <p class="font-caption text-text-muted mb-2">{label}</p>
            <div class="h-6 w-20 rounded bg-white/[0.04] animate-pulse" />
          </GlassCard>
        ))}
      </div>
    </div>
  );
};

export default Analytics;
