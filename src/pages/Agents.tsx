import type { Component } from "solid-js";
import { createSignal, createResource, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { proxyStore } from "../stores/proxyStore";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";

interface AgentStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  configured: boolean;
  configType: string; // "env" | "file" | "config" | "both"
  configPath?: string;
  docsUrl: string;
}

interface ConfigureResult {
  success: boolean;
  configType: string;
  configPath?: string;
  instructions: string;
  shellConfig?: string;
}

interface ShellConfigPanel {
  agentId: string;
  agentName: string;
  shellConfig: string;
}

const AGENT_ORDER = [
  "claude-code",
  "codex",
  "gemini-cli",
  "amp-cli",
  "opencode",
  "kiro",
];

const Agents: Component = () => {
  const { toast } = useToast();

  const [agents, { refetch }] = createResource(async () => {
    return await invoke<AgentStatus[]>("detect_cli_agents");
  });

  const [configuringId, setConfiguringId] = createSignal<string | null>(null);
  const [shellPanel, setShellPanel] = createSignal<ShellConfigPanel | null>(null);
  const [copiedShell, setCopiedShell] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);

  const isProxyRunning = () => proxyStore.status() === "running";

  const sortedAgents = () => {
    const list = agents() ?? [];
    return [...list].sort((a, b) => {
      const ai = AGENT_ORDER.indexOf(a.id);
      const bi = AGENT_ORDER.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setShellPanel(null);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleConfigure = async (agent: AgentStatus) => {
    setConfiguringId(agent.id);
    setShellPanel(null);
    try {
      const result = await invoke<ConfigureResult>("configure_cli_agent", {
        agentId: agent.id,
        port: proxyStore.port(),
      });

      if (!result.success) {
        toast.error(`Failed to configure ${agent.name}: ${result.instructions}`);
        return;
      }

      // For env/both types: show the shell config panel instead of a toast
      if ((result.configType === "env" || result.configType === "both") && result.shellConfig) {
        setShellPanel({
          agentId: agent.id,
          agentName: agent.name,
          shellConfig: result.shellConfig,
        });
        toast.success(`${agent.name}: shell config ready — add to your shell profile`);
      } else {
        // file/config type: just show instructions in a toast
        toast.success(`${agent.name} configured! ${result.instructions}`);
      }

      // Refresh agent list to pick up updated configured status
      await refetch();
    } catch (e: any) {
      toast.error(`Error configuring ${agent.name}: ${e}`);
    } finally {
      setConfiguringId(null);
    }
  };

  const handleCopyShellConfig = async () => {
    const panel = shellPanel();
    if (!panel) return;
    await navigator.clipboard.writeText(panel.shellConfig);
    setCopiedShell(true);
    setTimeout(() => setCopiedShell(false), 2000);
  };

  return (
    <div class="space-y-4 pb-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Agents</h1>
          <p class="font-caption text-text-muted mt-0.5">
            Configure AI coding tools to use your Aether proxy
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing() || agents.loading}
        >
          {refreshing() || agents.loading ? "Detecting…" : "Refresh"}
        </Button>
      </div>

      {/* Proxy status warning */}
      <Show when={!isProxyRunning()}>
        <div class="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <span class="text-warning text-sm">⚠</span>
          <div class="flex-1">
            <p class="font-body text-warning">Proxy not running</p>
            <p class="font-caption text-warning/80">
              Start the proxy first before configuring agents
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => proxyStore.startProxy()}>
            Start Proxy
          </Button>
        </div>
      </Show>

      {/* Shell config panel (for env-var based agents) */}
      <Show when={shellPanel()}>
        {(panel) => (
          <GlassCard>
            <div class="space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-body text-text">Add to your shell profile</p>
                  <p class="font-caption text-text-muted">
                    Copy these lines into{" "}
                    <code class="font-mono text-xs text-primary">~/.zshrc</code>{" "}
                    or{" "}
                    <code class="font-mono text-xs text-primary">~/.bashrc</code>
                    {" "}to configure {panel().agentName}
                  </p>
                </div>
                <button
                  class="text-text-muted hover:text-text transition-colors text-lg leading-none mt-0.5 flex-shrink-0"
                  onClick={() => setShellPanel(null)}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
              <div class="relative">
                <pre class="rounded-md border border-border bg-glass-bg px-4 py-3 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all">
                  {panel().shellConfig}
                </pre>
                <button
                  class="absolute top-2 right-2 px-2 py-1 rounded text-xs text-text-muted hover:text-primary hover:bg-white/5 border border-border/50 transition-colors bg-glass-bg"
                  onClick={handleCopyShellConfig}
                >
                  {copiedShell() ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </Show>

      {/* Agent cards */}
      <Show
        when={!agents.loading}
        fallback={
          <GlassCard>
            <p class="font-caption text-text-muted text-center py-4">Detecting installed agents…</p>
          </GlassCard>
        }
      >
        <div class="space-y-3">
          <For each={sortedAgents()}>
            {(agent) => (
              <GlassCard>
                <div
                  class={`flex items-start justify-between gap-4 ${
                    !agent.installed ? "opacity-50" : ""
                  }`}
                >
                  {/* Agent info */}
                  <div class="flex-1 min-w-0 space-y-1.5">
                    <p class="font-body text-text font-semibold">{agent.name}</p>
                    <p class="font-caption text-text-muted">{agent.description}</p>

                    {/* Status badges */}
                    <div class="flex items-center gap-2 flex-wrap pt-0.5">
                      <Show
                        when={agent.installed}
                        fallback={
                          <Badge variant="neutral">Not installed</Badge>
                        }
                      >
                        <Badge variant="active">Installed</Badge>
                      </Show>

                      <Show
                        when={agent.installed}
                      >
                        <Show
                          when={agent.configured}
                          fallback={
                            <Badge variant="neutral">Not configured</Badge>
                          }
                        >
                          <Badge variant="anthropic">Configured</Badge>
                        </Show>
                      </Show>
                    </div>

                    {/* Config path hint */}
                    <Show when={agent.installed && agent.configPath}>
                      <p class="font-caption text-text-muted font-mono text-xs truncate">
                        {agent.configPath}
                      </p>
                    </Show>

                    {/* Not installed note */}
                    <Show when={!agent.installed}>
                      <p class="font-caption text-text-muted italic">
                        Install {agent.name} to enable configuration
                      </p>
                    </Show>
                  </div>

                  {/* Configure button */}
                  <div class="flex-shrink-0 pt-0.5">
                    <Button
                      variant={agent.configured ? "ghost" : "primary"}
                      size="sm"
                      disabled={
                        !agent.installed ||
                        !isProxyRunning() ||
                        configuringId() === agent.id
                      }
                      onClick={() => handleConfigure(agent)}
                    >
                      {configuringId() === agent.id
                        ? "Configuring…"
                        : agent.configured
                        ? "Re-configure"
                        : "Configure"}
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default Agents;
