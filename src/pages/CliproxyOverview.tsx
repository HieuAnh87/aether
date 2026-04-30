import { Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@solidjs/router";
import { proxyStore } from "../stores/proxyStore";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";

interface AppSettings {
  autoStartProxy: boolean;
  launchAtLogin: boolean;
  proxyPort: number;
  managementKey: string;
}

const CliproxyOverview = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings] = createResource(() => invoke<AppSettings>("get_settings"));
  const [copiedKey, setCopiedKey] = createSignal(false);

  const isRunning = () => proxyStore.status() === "running";
  const isStopped = () => proxyStore.status() === "stopped" || proxyStore.status() === "crashed";

  const copyEndpoint = async () => {
    const port = proxyStore.port() || settings()?.proxyPort || 8317;
    await navigator.clipboard.writeText(`http://localhost:${port}/v1`);
    toast.success("Endpoint copied!");
  };

  const copyKey = async () => {
    const key = settings()?.managementKey;
    if (key) {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div class="space-y-4 pb-4">
      <h1 class="font-title text-text">Overview</h1>

      {/* Proxy status */}
      <GlassCard>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Proxy Status</p>
              <p class="font-caption text-text-muted">CLIProxyAPI sidecar process</p>
            </div>
            <Badge
              variant={
                isRunning() ? "active" :
                proxyStore.status() === "starting" ? "warning" :
                proxyStore.status() === "crashed" ? "error" :
                "neutral"
              }
            >
              {proxyStore.status() === "running" ? "Running" :
               proxyStore.status() === "starting" ? "Starting..." :
               proxyStore.status() === "crashed" ? "Crashed" :
               "Stopped"}
            </Badge>
          </div>

          <div class="flex gap-2">
            <Show when={isStopped()}>
              <Button variant="primary" size="sm" onClick={() => proxyStore.startProxy()}>
                Start Proxy
              </Button>
            </Show>
            <Show when={isRunning()}>
              <Button variant="ghost" size="sm" onClick={() => proxyStore.restartProxy(settings()?.proxyPort || 8317)}>
                Restart
              </Button>
              <Button variant="danger" size="sm" onClick={() => proxyStore.stopProxy()}>
                Stop
              </Button>
            </Show>
          </div>
        </div>
      </GlassCard>

      {/* Endpoint + management key (only when running) */}
      <Show when={isRunning()}>
        <GlassCard>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-text">OpenAI-compatible endpoint</p>
                <p class="font-caption text-text-muted">Use in Claude Code, Cursor, OpenCode, etc.</p>
              </div>
              <button
                class="px-3 py-1.5 rounded-md text-xs font-mono text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
                onClick={copyEndpoint}
              >
                http://localhost:{proxyStore.port() || 8317}/v1
              </button>
            </div>

            <div class="flex items-center justify-between border-t border-border/50 pt-3">
              <div>
                <p class="font-body text-text">Management Key</p>
                <p class="font-caption text-text-muted">Authenticates the Control Panel</p>
              </div>
              <div class="flex items-center gap-2">
                <code class="font-mono text-xs text-text-secondary">{settings()?.managementKey ?? "..."}</code>
                <button
                  class="px-2 py-1 rounded text-xs text-text-muted hover:text-primary hover:bg-white/5 transition-colors"
                  onClick={copyKey}
                >
                  {copiedKey() ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      </Show>

      {/* Quick links */}
      <GlassCard>
        <div class="space-y-2">
          <p class="font-label text-text-secondary">Quick access</p>
          <div class="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/cliproxy/providers")}>
              AI Providers
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/cliproxy/control-panel")}>
              Control Panel
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default CliproxyOverview;
