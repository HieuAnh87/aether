import { Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
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

type Tab = "overview" | "control-panel";

const ControlPanel = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = createSignal<Tab>("overview");
  const [settings] = createResource(() => invoke<AppSettings>("get_settings"));
  const [copied, setCopied] = createSignal(false);

  const isRunning = () => proxyStore.status() === "running";
  const isStopped = () => proxyStore.status() === "stopped";

  const copyKey = async () => {
    const key = settings()?.managementKey;
    if (key) {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyEndpoint = async () => {
    const port = proxyStore.port() || settings()?.proxyPort || 8317;
    await navigator.clipboard.writeText(`http://localhost:${port}/v1`);
    toast.success("Endpoint copied!");
  };

  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div class="mb-4 flex-shrink-0">
        <h1 class="font-title text-text">CLIProxy Plus</h1>
      </div>

      {/* Tabs */}
      <div class="flex gap-1 mb-4 flex-shrink-0 border-b border-border/50 pb-0">
        {(["overview", "control-panel"] as Tab[]).map((tab) => (
          <button
            class={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors relative ${
              activeTab() === tab
                ? "text-text border-b-2 border-primary"
                : "text-text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" ? "Overview" : "Control Panel"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div class="flex-1 min-h-0 overflow-auto">
        <Show when={activeTab() === "overview"}>
          <div class="space-y-4 pb-4">
            {/* Proxy status card */}
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
                  <Show when={isStopped() || proxyStore.status() === "crashed"}>
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

            {/* Endpoint info */}
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
                      <p class="font-caption text-text-muted">Used to authenticate the control panel</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <code class="font-mono text-xs text-text-secondary">{settings()?.managementKey ?? "..."}</code>
                      <button
                        class="px-2 py-1 rounded text-xs text-text-muted hover:text-primary hover:bg-white/5 transition-colors"
                        onClick={copyKey}
                      >
                        {copied() ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === "control-panel"}>
          <Show
            when={isRunning()}
            fallback={
              <div class="flex h-full items-center justify-center">
                <div class="text-center space-y-4">
                  <p class="font-body text-text-muted">Proxy must be running to access the control panel</p>
                  <Button variant="ghost" size="sm" onClick={() => proxyStore.startProxy()}>
                    Start Proxy
                  </Button>
                </div>
              </div>
            }
          >
            <iframe
              src={`http://localhost:${proxyStore.port()}/management.html`}
              class="w-full border-0 rounded-lg"
              style={{ height: "calc(100vh - 200px)" }}
              title="CLIProxyAPI Management Panel"
            />
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default ControlPanel;
