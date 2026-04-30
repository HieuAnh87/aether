import { Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { proxyStore } from "../stores/proxyStore";
import Button from "../components/Button";

interface AppSettings {
  proxyPort: number;
  managementKey: string;
}

const CliproxyControlPanel = () => {
  const [settings] = createResource(() => invoke<AppSettings>("get_settings"));
  const [copied, setCopied] = createSignal(false);

  const isRunning = () => proxyStore.status() === "running";

  const copyKey = async () => {
    const key = settings()?.managementKey;
    if (key) {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div class="flex flex-col h-full min-h-0">
      <Show
        when={isRunning()}
        fallback={
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center space-y-4">
              <p class="font-body text-text-muted">Proxy must be running to access the control panel</p>
              <Button variant="ghost" size="sm" onClick={() => proxyStore.startProxy()}>
                Start Proxy
              </Button>
            </div>
          </div>
        }
      >
        {/* Management key bar */}
        <div class="flex-shrink-0 px-4 pt-2 pb-1">
          <div class="px-3 py-1.5 rounded-lg bg-glass-bg border border-border/50 flex items-center justify-between text-xs">
            <span class="text-text-muted">
              Key: <code class="text-text-secondary font-mono">{settings()?.managementKey ?? "..."}</code>
            </span>
            <button
              class="px-2 py-0.5 rounded text-xs text-text-muted hover:text-primary hover:bg-white/5 transition-colors"
              onClick={copyKey}
            >
              {copied() ? "✓" : "Copy"}
            </button>
          </div>
        </div>

        {/* Iframe */}
        <iframe
          src={`http://localhost:${proxyStore.port()}/management.html`}
          class="flex-1 w-full border-0"
          title="CLIProxyAPI Management Panel"
        />
      </Show>
    </div>
  );
};

export default CliproxyControlPanel;
