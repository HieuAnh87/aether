import type { Component } from "solid-js";
import { createSignal, createResource, Show, Suspense } from "solid-js";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { proxyStore } from "../stores/proxyStore";
import { themeStore } from "../stores/themeStore";
import { invokeCompat } from "../stores/commandClient";

const DEFAULT_PROXY_PORT = 8317;

interface AppSettings {
  autoStartProxy: boolean;
  launchAtLogin: boolean;
  proxyPort: number;
  theme: "dark" | "light";
}

interface VersionInfo {
  appVersion: string;
  sidecarVersion: string;
}

const Settings: Component = () => {
  const { toast } = useToast();
  const [settings, { refetch }] = createResource(async () => {
    return await invokeCompat<AppSettings>("get_settings");
  });

  const [versionInfo] = createResource(async () => {
    return await invokeCompat<VersionInfo>("get_version_info");
  });

  const [pendingPort, setPendingPort] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const current = settings();
    if (!current) return;
    const updated = { ...current, [key]: value };
    setSaving(true);
    try {
      await invokeCompat<void>("update_settings", { settingsData: updated });
      refetch();
      toast.success("Setting saved");
    } catch (e: any) {
      toast.error(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePortChange = (value: string) => {
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 1024 && port <= 65535) {
      setPendingPort(port);
    }
  };

  const savePort = async () => {
    const port = pendingPort();
    if (port === null) return;
    await updateSetting("proxyPort", port);
    setPendingPort(null);
  };

  const handleRestartWithNewPort = async () => {
    const port = pendingPort() || settings()?.proxyPort || DEFAULT_PROXY_PORT;
    await savePort();
    try {
      await proxyStore.restartProxy(port);
      toast.success(`Proxy restarted on port ${port}`);
    } catch (e: any) {
      toast.error(`Failed to restart proxy: ${e}`);
    }
  };

  const portChanged = () => {
    const p = pendingPort();
    return p !== null && p !== settings()?.proxyPort;
  };

  const [checking, setChecking] = createSignal(false);
  const [updateAvailable, setUpdateAvailable] = createSignal<{ version: string; body: string | null } | null>(null);
  const [updating, setUpdating] = createSignal(false);
  const [updateProgress, setUpdateProgress] = createSignal(0);

  const checkForUpdates = async () => {
    setChecking(true);
    setUpdateAvailable(null);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version, body: update.body ?? null });
      } else {
        toast.success("You're up to date!");
      }
    } catch (e: any) {
      toast.error(`Update check failed: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    const update = updateAvailable();
    if (!update) return;

    setUpdating(true);
    setUpdateProgress(0);
    try {
      // Re-check to get the Update object for downloadAndInstall
      const freshUpdate = await check();
      if (!freshUpdate) {
        toast.error("Update no longer available");
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await freshUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setUpdateProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setUpdateProgress(100);
            break;
        }
      });

      toast.success("Update installed! Relaunching...");
      await relaunch();
    } catch (e: any) {
      toast.error(`Update failed: ${e}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div>
      <h1 class="font-title text-text mb-6">Settings</h1>

      {/* Loading skeleton */}
      <Suspense fallback={
        <div class="space-y-6">
          <div class="h-8 w-32 bg-border/30 rounded animate-pulse" />
          <GlassCard><div class="space-y-5 h-40 bg-border/20 rounded animate-pulse" /></GlassCard>
          <GlassCard><div class="space-y-5 h-24 bg-border/20 rounded animate-pulse" /></GlassCard>
          <GlassCard><div class="space-y-3 h-28 bg-border/20 rounded animate-pulse" /></GlassCard>
        </div>
      }>
        {/* Error state */}
        <Show when={(settings as unknown as { error?: unknown }).error}>
          <GlassCard>
            <p class="text-text-muted text-center py-4">Failed to load settings</p>
          </GlassCard>
        </Show>

        {/* General Section */}
        <h2 class="font-section-header text-text-secondary mb-3">General</h2>
        <GlassCard>
        <div class="space-y-5">
          {/* Auto-start proxy toggle */}
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Auto-start proxy</p>
              <p class="font-caption text-text-muted">Start CLIProxyAPI when Aether launches</p>
            </div>
            <button
              class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings()?.autoStartProxy ? "bg-primary" : "bg-border"
              }`}
              onClick={() => updateSetting("autoStartProxy", !settings()?.autoStartProxy)}
              disabled={saving()}
            >
              <span
                class={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  settings()?.autoStartProxy ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Launch at login toggle */}
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Launch at login</p>
              <p class="font-caption text-text-muted">Start Aether when macOS starts</p>
            </div>
            <button
              class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings()?.launchAtLogin ? "bg-primary" : "bg-border"
              }`}
              onClick={() => updateSetting("launchAtLogin", !settings()?.launchAtLogin)}
              disabled={saving()}
            >
              <span
                class={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  settings()?.launchAtLogin ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Theme toggle */}
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Appearance</p>
              <p class="font-caption text-text-muted">Switch between light and dark mode</p>
            </div>
            <button
              class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                themeStore.theme() === "light" ? "bg-primary" : "bg-border"
              }`}
              onClick={() => {
                const newTheme = themeStore.theme() === "dark" ? "light" : "dark";
                themeStore.setTheme(newTheme);
                updateSetting("theme", newTheme);
              }}
              disabled={saving()}
            >
              <span
                class={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  themeStore.theme() === "light" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Proxy on/off */}
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Proxy</p>
              <p class="font-caption text-text-muted">
                {proxyStore.status() === "running"
                  ? `Running on port ${proxyStore.port()}`
                  : proxyStore.status() === "starting"
                  ? "Starting..."
                  : proxyStore.status() === "crashed"
                  ? "Crashed — click to restart"
                  : "Stopped"}
              </p>
            </div>
            <button
              class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                proxyStore.status() === "running" ? "bg-primary" : "bg-border"
              }`}
              disabled={proxyStore.status() === "starting"}
              onClick={() => {
                if (proxyStore.status() === "running") {
                  proxyStore.stopProxy();
                } else {
                  proxyStore.startProxy();
                }
              }}
            >
              <span
                class={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  proxyStore.status() === "running" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Proxy Section */}
      <h2 class="font-section-header text-text-secondary mb-3 mt-6">Proxy</h2>
      <GlassCard>
        <div class="space-y-5">
          {/* Port input */}
          <div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-text">Proxy port</p>
                <p class="font-caption text-text-muted">Port for CLIProxyAPI (1024–65535)</p>
              </div>
              <input
                type="number"
                min="1024"
                max="65535"
                class="w-24 rounded-md border border-border bg-glass-bg px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={pendingPort() ?? settings()?.proxyPort ?? DEFAULT_PROXY_PORT}
                onInput={(e: any) => handlePortChange(e.currentTarget.value)}
              />
            </div>

            {/* Port change warning */}
            <Show when={portChanged()}>
              <div class="mt-3 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                <p class="font-caption text-warning">Proxy restart required for port change</p>
                <Button variant="primary" size="sm" onClick={handleRestartWithNewPort}>
                  Restart Now
                </Button>
              </div>
            </Show>
          </div>

          {/* Endpoint URL display */}
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-text">Endpoint URL</p>
              <p class="font-caption text-text-muted">Use this URL in your AI client config</p>
            </div>
            <code class="font-mono text-sm text-primary">
              http://localhost:{pendingPort() ?? settings()?.proxyPort ?? DEFAULT_PROXY_PORT}/v1
            </code>
          </div>
        </div>
      </GlassCard>

      {/* About Section */}
      <h2 class="font-section-header text-text-secondary mb-3 mt-6">About</h2>
      <GlassCard>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="font-body text-text">Aether version</p>
            <code class="font-mono text-sm text-text-secondary">
              v{versionInfo()?.appVersion ?? "..."}
            </code>
          </div>
          <div class="flex items-center justify-between">
            <p class="font-body text-text">CLIProxyAPI version</p>
            <code class="font-mono text-sm text-text-secondary">
              {versionInfo()?.sidecarVersion ?? "..."}
            </code>
          </div>

          {/* Update check */}
          <div class="border-t border-border/50 pt-3 mt-1">
            <Show when={!updateAvailable()} fallback={
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-body text-text">Update available: v{updateAvailable()!.version}</p>
                    <Show when={updateAvailable()!.body}>
                      <p class="font-caption text-text-muted mt-1 line-clamp-2">{updateAvailable()!.body}</p>
                    </Show>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={installUpdate}
                    disabled={updating()}
                  >
                    {updating() ? `Installing ${updateProgress()}%` : "Install Update"}
                  </Button>
                </div>
                <Show when={updating()}>
                  <div class="w-full bg-border rounded-full h-1.5">
                    <div
                      class="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${updateProgress()}%` }}
                    />
                  </div>
                </Show>
              </div>
            }>
              <div class="flex items-center justify-between">
                <p class="font-body text-text-muted">Check for app updates</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={checkForUpdates}
                  disabled={checking()}
                >
                  {checking() ? "Checking..." : "Check for Updates"}
                </Button>
              </div>
            </Show>
          </div>
        </div>
      </GlassCard>
      </Suspense>
    </div>
  );
};

export default Settings;
