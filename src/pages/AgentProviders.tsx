import type { Component } from "solid-js";
import GlassCard from "../components/GlassCard";

const AgentProviders: Component = () => {
  return (
    <div class="space-y-4 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Agent Providers</h1>
          <p class="font-caption text-text-muted mt-0.5">
            Configure model providers for each AI coding agent
          </p>
        </div>
      </div>

      <GlassCard>
        <div class="py-8 text-center space-y-2">
          <p class="font-body text-text-muted">Coming soon</p>
          <p class="font-caption text-text-tertiary">
            Per-agent model provider configuration will be available here.
          </p>
        </div>
      </GlassCard>
    </div>
  );
};

export default AgentProviders;
