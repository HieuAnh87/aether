import type { Component } from "solid-js";
import { createSignal, createResource, createEffect, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { proxyStore } from "../stores/proxyStore";
import { presetStore } from "../stores/presetStore";
import { agentProviderStore } from "../stores/agentProviderStore";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";

// ─── Interfaces (kept from original) ─────────────────────────────────────────

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

interface OpenCodePreview {
  configPath: string;
  existingFileFound: boolean;
  existingAetherProvider: boolean;
  willInject: Record<string, unknown>;
  isSafeMerge: boolean;
}

interface ClaudeCodePreview {
  configPath: string;
  existingFileFound: boolean;
  existingEnvConfig: boolean;
  willInject: Record<string, unknown>;
  isSafeMerge: boolean;
}

interface ClaudeSubModels {
  opus: string;
  sonnet: string;
  haiku: string;
  small: string;
}

interface ClaudeModelSlot {
  id: keyof ClaudeSubModels | "main";
  label: string;
  envVar: string;
  defaultModel: string;
}

const CLAUDE_MODEL_SLOTS: ClaudeModelSlot[] = [
  { id: "main", label: "Primary Model", envVar: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-6" },
  { id: "opus", label: "Opus Model", envVar: "ANTHROPIC_DEFAULT_OPUS_MODEL", defaultModel: "claude-opus-4-6" },
  { id: "sonnet", label: "Sonnet Model", envVar: "ANTHROPIC_DEFAULT_SONNET_MODEL", defaultModel: "claude-sonnet-4-6" },
  { id: "haiku", label: "Haiku Model", envVar: "ANTHROPIC_DEFAULT_HAIKU_MODEL", defaultModel: "claude-haiku-4-5-20251001" },
  { id: "small", label: "Small/Fast Model", envVar: "ANTHROPIC_SMALL_FAST_MODEL", defaultModel: "claude-haiku-4-5-20251001" },
];

// ─── Agent-specific config metadata ──────────────────────────────────────────

interface AgentConfigMeta {
  configTarget: string;
  configExplanation: string;
  models: string[];
  defaultModel?: string;
  supportsEffort: boolean;
  effortOptions?: string[];
  defaultEffort?: string;
  usesAvailableModels?: boolean; // use presetStore.availableModels() dynamically
}

const AGENT_CONFIG_META: Record<string, AgentConfigMeta> = {
  "claude-code": {
    configTarget: "~/.claude/settings.json (env section)",
    configExplanation:
      "Sets ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, and ANTHROPIC_MODEL in ~/.claude/settings.json (env section). Safe merge — existing keys untouched.",
    models: [],
    defaultModel: "claude-sonnet-4-6",
    supportsEffort: false,
    usesAvailableModels: true,
  },
  codex: {
    configTarget: "~/.codex/config.toml + ~/.codex/auth.json",
    configExplanation:
      "Sets model_provider=aether and configures reasoning effort in config.toml",
    models: ["gpt-5.4", "gpt-5-pro", "o4-mini", "gpt-4.1"],
    defaultModel: "gpt-5.4",
    supportsEffort: true,
    effortOptions: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
  },
  "gemini-cli": {
    configTarget: "Shell profile (~/.zshrc or ~/.bashrc)",
    configExplanation:
      "Exports CODE_ASSIST_ENDPOINT env var — only works with OAuth login (gemini login), not with GEMINI_API_KEY",
    models: [],
    supportsEffort: false,
  },
  "amp-cli": {
    configTarget: "~/.config/amp/settings.json",
    configExplanation:
      "Sets amp.url and amp.apiKey in Amp's settings file",
    models: [],
    supportsEffort: false,
  },
  opencode: {
    configTarget: "~/.config/opencode/opencode.json",
    configExplanation:
      "Injects an 'aether' provider into opencode.json (safe merge — existing keys untouched). Optionally set a default model.",
    models: [],
    supportsEffort: false,
    usesAvailableModels: true,
  },
  kiro: {
    configTarget: "Shell profile (~/.zshrc or ~/.bashrc)",
    configExplanation:
      "Exports KIRO_ENDPOINT and KIRO_API_KEY env vars to shell profile",
    models: [],
    supportsEffort: false,
  },
};

// ─── Agent ordering ───────────────────────────────────────────────────────────

const AGENT_ORDER = [
  "claude-code",
  "codex",
  "gemini-cli",
  "amp-cli",
  "opencode",
  "kiro",
];

// ─── Agent icon map ───────────────────────────────────────────────────────────

const agentIcon = (id: string): string => {
  const icons: Record<string, string> = {
    "claude-code": "✦",
    codex: "◈",
    "gemini-cli": "◇",
    "amp-cli": "⬡",
    opencode: "◉",
    kiro: "⬢",
  };
  return icons[id] ?? "◌";
};

// ─── Effort label display helper ──────────────────────────────────────────────

const effortLabel = (e: string) =>
  e.charAt(0).toUpperCase() + e.slice(1);

// ─── Main component ───────────────────────────────────────────────────────────

const Agents: Component = () => {
  const { toast } = useToast();

  const [agents, { refetch }] = createResource(async () => {
    return await invoke<AgentStatus[]>("detect_cli_agents");
  });

  // Expansion & selection state
  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [selectedModels, setSelectedModels] = createSignal<Record<string, string>>({});
  const [selectedEfforts, setSelectedEfforts] = createSignal<Record<string, string>>({});

  // Shell config panel state (env-type agents)
  const [shellPanel, setShellPanel] = createSignal<ShellConfigPanel | null>(null);
  const [copiedShell, setCopiedShell] = createSignal(false);

  // OpenCode preview panel
  const [opencodePreview, setOpencodePreview] = createSignal<OpenCodePreview | null>(null);
  const [previewLoading, setPreviewLoading] = createSignal(false);

  // Claude Code preview panel
  const [claudePreview, setClaudePreview] = createSignal<ClaudeCodePreview | null>(null);
  const [claudePreviewLoading, setClaudePreviewLoading] = createSignal(false);

  // Claude Code sub-model selections (opus, sonnet, haiku, small)
  const [claudeSubModels, setClaudeSubModels] = createSignal<ClaudeSubModels>({
    opus: "",
    sonnet: "",
    haiku: "",
    small: "",
  });

  // Misc
  const [configuringId, setConfiguringId] = createSignal<string | null>(null);
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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getModel = (agentId: string) => {
    const meta = AGENT_CONFIG_META[agentId];
    return selectedModels()[agentId] ?? meta?.defaultModel ?? "";
  };

  const getEffort = (agentId: string) => {
    const meta = AGENT_CONFIG_META[agentId];
    return selectedEfforts()[agentId] ?? meta?.defaultEffort ?? "high";
  };

  const toggleExpanded = (agentId: string) => {
    const wasExpanded = expandedId() === agentId;
    setExpandedId(wasExpanded ? null : agentId);
  };

  // Derive a non-aether model list for dynamic model pickers (opencode, claude-code)
  // When filterCompat is specified, only show models from providers with that compatibility.
  const availableModelsForAgent = (filterCompat: "openai" | "anthropic" | null = null) => {
    const all = presetStore.availableModels() ?? [];
    const nonAether = all.filter((m) => !m.startsWith("aether/"));
    if (!filterCompat) return nonAether;

    // Get provider IDs matching the required compatibility
    const matchingProviderIds = new Set(
      agentProviderStore.providers()
        .filter((p) => p.compatibility === filterCompat)
        .map((p) => p.id)
    );
    if (matchingProviderIds.size === 0) return nonAether; // fallback: show all if no providers loaded

    return nonAether.filter((m) => {
      const slashIdx = m.indexOf("/");
      const providerId = slashIdx > 0 ? m.slice(0, slashIdx) : "";
      return matchingProviderIds.has(providerId);
    });
  };

  const loadOpencodePreview = async (selectedModel?: string) => {
    setPreviewLoading(true);
    try {
      const preview = await invoke<OpenCodePreview>("preview_opencode_config", {
        port: proxyStore.port(),
        model: selectedModel ?? (selectedModels()["opencode"] || undefined),
      });
      setOpencodePreview(preview);
    } catch {
      setOpencodePreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Reload preview when opencode model selection changes
  createEffect(() => {
    const model = selectedModels()["opencode"];
    if (expandedId() === "opencode") {
      void loadOpencodePreview(model);
    }
  });

  const loadClaudePreview = async (selectedModel?: string) => {
    setClaudePreviewLoading(true);
    const subs = claudeSubModels();
    try {
      const preview = await invoke<ClaudeCodePreview>("preview_claude_code_config", {
        port: proxyStore.port(),
        model: selectedModel ?? (selectedModels()["claude-code"] || undefined),
        opusModel: subs.opus || undefined,
        sonnetModel: subs.sonnet || undefined,
        haikuModel: subs.haiku || undefined,
        smallFastModel: subs.small || undefined,
      });
      setClaudePreview(preview);
    } catch {
      setClaudePreview(null);
    } finally {
      setClaudePreviewLoading(false);
    }
  };

  // Reload preview when claude-code model selection changes
  createEffect(() => {
    const model = selectedModels()["claude-code"];
    // Track sub-models reactively
    const subs = claudeSubModels();
    void subs; // read to track
    if (expandedId() === "claude-code") {
      void loadClaudePreview(model);
    }
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    setShellPanel(null);
    setExpandedId(null);
    setOpencodePreview(null);
    setClaudePreview(null);
    setClaudeSubModels({ opus: "", sonnet: "", haiku: "", small: "" });
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleApplyConfigure = async (agent: AgentStatus) => {
    const meta = AGENT_CONFIG_META[agent.id];
    setConfiguringId(agent.id);
    try {
      const modelValue =
        meta?.models.length
          ? getModel(agent.id) || undefined
          : meta?.usesAvailableModels
          ? selectedModels()[agent.id] || undefined
          : undefined;

      const subs = claudeSubModels();
      const result = await invoke<ConfigureResult>("configure_cli_agent", {
        agentId: agent.id,
        port: proxyStore.port(),
        model: modelValue,
        effort: meta?.supportsEffort ? getEffort(agent.id) || undefined : undefined,
        ...(agent.id === "claude-code" && {
          opusModel: subs.opus || undefined,
          sonnetModel: subs.sonnet || undefined,
          haikuModel: subs.haiku || undefined,
          smallFastModel: subs.small || undefined,
        }),
      });

      if (!result.success) {
        toast.error(`Failed to configure ${agent.name}: ${result.instructions}`);
        return;
      }

      // Env/both types: show the shell config panel
      if (
        (result.configType === "env" || result.configType === "both") &&
        result.shellConfig
      ) {
        setShellPanel({
          agentId: agent.id,
          agentName: agent.name,
          shellConfig: result.shellConfig,
        });
        toast.success(`${agent.name}: shell config ready — add to your shell profile`);
      } else {
        toast.success(`${agent.name} configured! ${result.instructions}`);
      }

      // Collapse panel on success
      setExpandedId(null);
      await refetch();
    } catch (e: unknown) {
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div class="space-y-4 pb-4">

      {/* ── Header ── */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Agents</h1>
          <p class="font-caption text-text-secondary mt-0.5">
            Configure AI coding tools to use your Aether proxy
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing() || agents.loading}
        >
          <Show when={refreshing() || agents.loading} fallback={<>Refresh</>}>
            Detecting…
          </Show>
        </Button>
      </div>

      {/* ── Proxy warning ── */}
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

      {/* ── Shell config panel (env-type agents) ── */}
      <Show when={shellPanel()}>
        {(panel) => (
          <GlassCard class="border-primary/20">
            <div class="space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-2.5">
                  {/* Terminal icon */}
                  <div class="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="text-primary"
                    >
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-body text-text font-medium">Add to your shell profile</p>
                    <p class="font-caption text-text-secondary mt-0.5">
                      Copy into{" "}
                      <code class="font-mono text-xs text-primary">~/.zshrc</code>
                      {" "}or{" "}
                      <code class="font-mono text-xs text-primary">~/.bashrc</code>
                      {" "}to configure {panel().agentName}
                    </p>
                  </div>
                </div>
                <button
                  class="text-text-secondary hover:text-text transition-colors text-lg leading-none mt-0.5 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-glass-bg-hover"
                  onClick={() => setShellPanel(null)}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
              <div class="relative">
                <pre class="rounded-md border border-border bg-glass-bg px-4 py-3 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                  {panel().shellConfig}
                </pre>
                <button
                  class="absolute top-2 right-2 px-2 py-1 rounded text-xs transition-colors border border-border/50 bg-glass-bg"
                  classList={{
                    "text-success border-success/40 bg-success/10": copiedShell(),
                    "text-text-secondary hover:text-primary hover:bg-white/5": !copiedShell(),
                  }}
                  onClick={handleCopyShellConfig}
                >
                  <Show when={copiedShell()} fallback="Copy">
                    ✓ Copied
                  </Show>
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </Show>

      {/* ── Agent cards ── */}
      <Show
        when={!agents.loading}
        fallback={
          <GlassCard>
            <p class="font-caption text-text-secondary text-center py-4">
              Detecting installed agents…
            </p>
          </GlassCard>
        }
      >
        <div class="space-y-2">
          <For each={sortedAgents()}>
            {(agent) => {
              const meta = AGENT_CONFIG_META[agent.id];
              const isExpanded = () => expandedId() === agent.id;
              const isConfiguring = () => configuringId() === agent.id;

              return (
                <div
                  class="rounded-lg overflow-hidden transition-all duration-200"
                  classList={{
                    "opacity-60": !agent.installed,
                  }}
                  style={{
                    "border": isExpanded()
                      ? "1px solid rgba(59,130,246,0.25)"
                      : "1px solid rgba(255,255,255,0.08)",
                    "background": "rgba(255,255,255,0.04)",
                    "backdrop-filter": "blur(20px)",
                    "-webkit-backdrop-filter": "blur(20px)",
                    "box-shadow": isExpanded()
                      ? "0 0 0 1px rgba(59,130,246,0.1), 0 4px 24px rgba(0,0,0,0.2)"
                      : "none",
                    "transition": "border-color 200ms ease, box-shadow 200ms ease",
                  }}
                >
                  {/* ── Card header row ── */}
                  <div class="flex items-start gap-4 px-5 py-4">
                    {/* Agent icon */}
                    <div
                      class="w-9 h-9 rounded-md flex items-center justify-center text-lg flex-shrink-0 font-medium"
                      style={{
                        "background": isExpanded()
                          ? "rgba(59,130,246,0.15)"
                          : "rgba(255,255,255,0.06)",
                        "color": isExpanded() ? "var(--color-primary)" : "var(--color-text-secondary)",
                        "border": isExpanded()
                          ? "1px solid rgba(59,130,246,0.2)"
                          : "1px solid rgba(255,255,255,0.08)",
                        "transition": "all 200ms ease",
                      }}
                    >
                      {agentIcon(agent.id)}
                    </div>

                    {/* Info */}
                    <div class="flex-1 min-w-0 space-y-1.5">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-body text-text font-semibold">{agent.name}</span>
                        <Show
                          when={agent.installed}
                          fallback={<Badge variant="neutral">Not installed</Badge>}
                        >
                          <Badge variant="active">Installed</Badge>
                          <Show
                            when={agent.configured}
                            fallback={<Badge variant="neutral">Not configured</Badge>}
                          >
                            <Badge variant="anthropic">Configured</Badge>
                          </Show>
                        </Show>
                      </div>
                      <p class="font-caption text-text-secondary leading-relaxed">
                        {agent.description}
                      </p>
                      {/* Config target hint (always visible when installed) */}
                      <Show when={agent.installed && meta}>
                        <p class="font-micro text-text-secondary font-mono opacity-60 truncate">
                          {meta.configTarget}
                        </p>
                      </Show>
                      <Show when={!agent.installed}>
                        <p class="font-caption text-text-secondary italic opacity-70">
                          Install {agent.name} to enable configuration
                        </p>
                      </Show>
                    </div>

                    {/* Configure toggle button */}
                    <div class="flex-shrink-0 pt-0.5">
                      <Show
                        when={isExpanded()}
                        fallback={
                          <Button
                            variant={agent.configured ? "ghost" : "primary"}
                            size="sm"
                            disabled={!agent.installed || !isProxyRunning()}
                            onClick={() => toggleExpanded(agent.id)}
                          >
                            {agent.configured ? "Re-configure" : "Configure"}
                          </Button>
                        }
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(null)}
                        >
                          Cancel
                        </Button>
                      </Show>
                    </div>
                  </div>

                  {/* ── Expandable configure panel ── */}
                  <Show when={isExpanded() && meta}>
                    <div
                      style={{
                        "border-top": "1px solid rgba(255,255,255,0.06)",
                        "background": "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div class="px-5 py-4 space-y-4">

                        {/* Info row: what this does */}
                        <div class="flex items-start gap-2.5 rounded-md px-3 py-2.5"
                          style={{ "background": "rgba(59,130,246,0.06)", "border": "1px solid rgba(59,130,246,0.12)" }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="text-primary/70 flex-shrink-0 mt-0.5"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                          <p class="font-caption text-text-secondary leading-relaxed">
                            {meta.configExplanation}
                          </p>
                        </div>

                        {/* Model selector — static list (claude-code, codex) */}
                        <Show when={meta.models.length > 0}>
                          <div class="space-y-1.5">
                            <label class="font-micro text-text-secondary block">
                              Model
                            </label>
                            <div class="relative">
                              <select
                                class="w-full appearance-none rounded-md px-3 py-2 font-caption text-text pr-8 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors cursor-pointer"
                                style={{
                                  "background": "rgba(255,255,255,0.06)",
                                  "border": "1px solid rgba(255,255,255,0.1)",
                                  "color": "var(--color-text)",
                                }}
                                value={getModel(agent.id)}
                                onChange={(e) =>
                                  setSelectedModels((prev) => ({
                                    ...prev,
                                    [agent.id]: e.currentTarget.value,
                                  }))
                                }
                              >
                                <For each={meta.models}>
                                  {(m) => (
                                    <option
                                      value={m}
                                      style={{ "background": "#141416" }}
                                    >
                                      {m}
                                    </option>
                                  )}
                                </For>
                              </select>
                              {/* Chevron icon */}
                              <div class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  class="text-text-secondary"
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </Show>

                        {/* Model selectors — Claude Code: 5 per-role model slots */}
                        <Show when={meta.usesAvailableModels && agent.id === "claude-code"}>
                          <div class="space-y-2">
                            <label class="font-micro text-text-secondary block">
                              Model Configuration
                            </label>
                            <For each={CLAUDE_MODEL_SLOTS}>
                              {(slot) => {
                                const isMain = slot.id === "main";
                                const currentMain = () => selectedModels()["claude-code"] ?? "";
                                const currentSub = () => claudeSubModels()[slot.id as keyof ClaudeSubModels] ?? "";
                                const currentValue = () => isMain ? currentMain() : currentSub();
                                const hasValue = () => currentValue() !== "";

                                const selectModelClass = () =>
                                  isMain
                                    ? "w-full appearance-none rounded-md px-3 py-2 font-caption text-text pr-8 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors cursor-pointer"
                                    : "w-full appearance-none rounded-md px-3 py-1.5 font-caption text-text pr-8 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors cursor-pointer";

                                return (
                                  <div class="flex items-center gap-2">
                                    <div class="flex-1 min-w-0">
                                      <label class="font-micro text-text-secondary/80 block leading-none mb-1">
                                        {slot.label}
                                      </label>
                                      <div class="relative">
                                        <select
                                          class={selectModelClass()}
                                          style={{
                                            "background": "rgba(255,255,255,0.06)",
                                            "border": "1px solid rgba(255,255,255,0.1)",
                                            "color": currentValue() ? "var(--color-text)" : "var(--color-text-secondary)",
                                          }}
                                          value={currentValue()}
                                          onChange={(e) => {
                                            const val = e.currentTarget.value;
                                            if (isMain) {
                                              setSelectedModels((prev) =>
                                                val ? { ...prev, "claude-code": val } : (() => { const n = { ...prev }; delete n["claude-code"]; return n; })()
                                              );
                                            } else {
                                              const key = slot.id as keyof ClaudeSubModels;
                                              setClaudeSubModels((prev) => ({ ...prev, [key]: val }));
                                            }
                                          }}
                                        >
                                          <option value="" style={{ "background": "#141416" }}>
                                            — use default ({slot.defaultModel}) —
                                          </option>
                                          <For each={availableModelsForAgent("anthropic")}>
                                            {(m) => (
                                              <option value={m} style={{ "background": "#141416" }}>
                                                {m}
                                              </option>
                                            )}
                                          </For>
                                        </select>
                                        <div class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-secondary">
                                            <polyline points="6 9 12 15 18 9" />
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                    <div class="flex gap-1 pt-4">
                                      <Show when={hasValue()}>
                                        <button
                                          class="px-2 py-1 rounded text-xs font-micro text-text-secondary/60 hover:text-text-secondary transition-colors border border-border/50"
                                          onClick={() => {
                                            if (isMain) {
                                              setSelectedModels((prev) => { const n = { ...prev }; delete n["claude-code"]; return n; });
                                            } else {
                                              const key = slot.id as keyof ClaudeSubModels;
                                              setClaudeSubModels((prev) => ({ ...prev, [key]: "" }));
                                            }
                                          }}
                                        >
                                          Reset
                                        </button>
                                      </Show>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                            <p class="font-micro text-text-secondary/60">
                              Only models from Anthropic-compatible providers are shown. Values are written as env vars in <code class="font-mono">~/.claude/settings.json</code>.
                            </p>
                          </div>
                        </Show>

                        {/* Model selector — OpenCode: dynamic single dropdown */}
                        <Show when={meta.usesAvailableModels && agent.id === "opencode"}>
                          <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                              <label class="font-micro text-text-secondary block">
                                Default Model <span class="opacity-50">(optional)</span>
                              </label>
                              <Show when={selectedModels()[agent.id]}>
                                <button
                                  class="font-micro text-text-secondary/60 hover:text-text-secondary transition-colors"
                                  onClick={() =>
                                    setSelectedModels((prev) => {
                                      const next = { ...prev };
                                      delete next[agent.id];
                                      return next;
                                    })
                                  }
                                >
                                  Clear
                                </button>
                              </Show>
                            </div>
                            <div class="relative">
                              <select
                                class="w-full appearance-none rounded-md px-3 py-2 font-caption text-text pr-8 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors cursor-pointer"
                                style={{
                                  "background": "rgba(255,255,255,0.06)",
                                  "border": "1px solid rgba(255,255,255,0.1)",
                                  "color": selectedModels()[agent.id] ? "var(--color-text)" : "var(--color-text-secondary)",
                                }}
                                value={selectedModels()[agent.id] ?? ""}
                                onChange={(e) => {
                                  const val = e.currentTarget.value;
                                  if (val) {
                                    setSelectedModels((prev) => ({ ...prev, [agent.id]: val }));
                                  } else {
                                    setSelectedModels((prev) => {
                                      const n = { ...prev };
                                      delete n[agent.id];
                                      return n;
                                    });
                                  }
                                }}
                              >
                                <option value="" style={{ "background": "#141416" }}>
                                  — no default —
                                </option>
                                <For each={availableModelsForAgent(null)}>
                                  {(m) => (
                                    <option
                                      value={m}
                                      style={{ "background": "#141416" }}
                                    >
                                      {m}
                                    </option>
                                  )}
                                </For>
                              </select>
                              <div class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  class="text-text-secondary"
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </div>
                            </div>
                            <p class="font-micro text-text-secondary/60">
                              This sets the top-level <code class="font-mono">model</code> key in opencode.json. You can always change it with <code class="font-mono">/model</code> in OpenCode.
                            </p>
                          </div>
                        </Show>

                        {/* OpenCode config preview */}
                        <Show when={agent.id === "opencode"}>
                          <div class="space-y-1.5">
                            <div class="flex items-center gap-2">
                              <label class="font-micro text-text-secondary block">
                                Config Preview
                              </label>
                              <Show when={previewLoading()}>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  class="animate-spin text-text-secondary/50"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                              </Show>
                            </div>
                            <Show when={opencodePreview()} fallback={
                              <p class="font-micro text-text-secondary/50 italic">Loading preview…</p>
                            }>
                              {(preview) => (
                                <div class="space-y-2">
                                  {/* Safe merge badge */}
                                  <div class="flex items-center gap-2 flex-wrap">
                                    <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-micro"
                                      style={{ "background": "rgba(34,197,94,0.1)", "border": "1px solid rgba(34,197,94,0.25)", "color": "rgb(134,239,172)" }}
                                    >
                                      ✓ Safe merge
                                    </span>
                                    <Show when={preview().existingFileFound}>
                                      <span class="font-micro text-text-secondary/60">
                                        {preview().existingAetherProvider
                                          ? "Will update existing aether provider"
                                          : "Will add aether provider to existing file"}
                                      </span>
                                    </Show>
                                    <Show when={!preview().existingFileFound}>
                                      <span class="font-micro text-text-secondary/60">
                                        Will create new opencode.json
                                      </span>
                                    </Show>
                                  </div>
                                  {/* JSON delta */}
                                  <pre class="rounded-md border border-border bg-glass-bg px-3 py-2.5 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
                                    style={{ "font-size": "10px" }}
                                  >
                                    {JSON.stringify(preview().willInject, null, 2)}
                                  </pre>
                                  <p class="font-micro text-text-secondary/50">
                                    All other keys (mcp, agent, plugin, model, etc.) are preserved as-is.
                                  </p>
                                </div>
                              )}
                            </Show>
                          </div>
                        </Show>

                        {/* Claude Code config preview */}
                        <Show when={agent.id === "claude-code"}>
                          <div class="space-y-1.5">
                            <div class="flex items-center gap-2">
                              <label class="font-micro text-text-secondary block">
                                Config Preview
                              </label>
                              <Show when={claudePreviewLoading()}>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  class="animate-spin text-text-secondary/50"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                              </Show>
                            </div>
                            <Show when={claudePreview()} fallback={
                              <p class="font-micro text-text-secondary/50 italic">Loading preview…</p>
                            }>
                              {(preview) => (
                                <div class="space-y-2">
                                  <div class="flex items-center gap-2 flex-wrap">
                                    <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-micro"
                                      style={{ "background": "rgba(34,197,94,0.1)", "border": "1px solid rgba(34,197,94,0.25)", "color": "rgb(134,239,172)" }}
                                    >
                                      ✓ Safe merge
                                    </span>
                                    <Show when={preview().existingFileFound}>
                                      <span class="font-micro text-text-secondary/60">
                                        {preview().existingEnvConfig
                                          ? "Will update existing env config"
                                          : "Will add env config to existing file"}
                                      </span>
                                    </Show>
                                    <Show when={!preview().existingFileFound}>
                                      <span class="font-micro text-text-secondary/60">
                                        Will create new settings.json
                                      </span>
                                    </Show>
                                  </div>
                                  <pre class="rounded-md border border-border bg-glass-bg px-3 py-2.5 text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
                                    style={{ "font-size": "10px" }}
                                  >
                                    {JSON.stringify(preview().willInject, null, 2)}
                                  </pre>
                                  <p class="font-micro text-text-secondary/50">
                                    All other keys (permissions, hooks, etc.) are preserved as-is.
                                  </p>
                                </div>
                              )}
                            </Show>
                          </div>
                        </Show>

                        {/* Thinking effort selector */}
                        <Show when={meta.supportsEffort && meta.effortOptions}>
                          <div class="space-y-1.5">
                            <label class="font-micro text-text-secondary block">
                              Thinking Effort
                            </label>
                            <div class="flex gap-1.5">
                              <For each={meta.effortOptions!}>
                                {(opt) => {
                                  const isActive = () => getEffort(agent.id) === opt;
                                  return (
                                    <button
                                      class="flex-1 py-1.5 rounded-md font-micro transition-all duration-150 border"
                                      style={{
                                        "background": isActive()
                                          ? "rgba(59,130,246,0.2)"
                                          : "rgba(255,255,255,0.04)",
                                        "border-color": isActive()
                                          ? "rgba(59,130,246,0.4)"
                                          : "rgba(255,255,255,0.08)",
                                        "color": isActive()
                                          ? "var(--color-primary)"
                                          : "var(--color-text-secondary)",
                                        "font-weight": isActive() ? "600" : "400",
                                      }}
                                      onClick={() =>
                                        setSelectedEfforts((prev) => ({
                                          ...prev,
                                          [agent.id]: opt,
                                        }))
                                      }
                                    >
                                      {effortLabel(opt)}
                                    </button>
                                  );
                                }}
                              </For>
                            </div>
                          </div>
                        </Show>

                        {/* Action buttons */}
                        <div class="flex items-center gap-2 pt-1">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isConfiguring() || !isProxyRunning()}
                            onClick={() => handleApplyConfigure(agent)}
                          >
                            <Show
                              when={!isConfiguring()}
                              fallback={
                                <span class="flex items-center gap-1.5">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="animate-spin"
                                  >
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                  </svg>
                                  Applying…
                                </span>
                              }
                            >
                              Apply Configuration
                            </Show>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default Agents;
