import type { Component } from "solid-js";
import { createMemo, createSignal, createResource, Show, Suspense } from "solid-js";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";
import Badge from "../components/Badge";
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
  const [checking, setChecking] = createSignal(false);
  const [updateAvailable, setUpdateAvailable] = createSignal<{ version: string; body: string | null } | null>(null);
  const [updating, setUpdating] = createSignal(false);
  const [updateProgress, setUpdateProgress] = createSignal(0);
  const [copiedEndpoint, setCopiedEndpoint] = createSignal(false);

  const effectivePort = createMemo(() => pendingPort() ?? settings.latest?.proxyPort ?? DEFAULT_PROXY_PORT);
  const endpointUrl = createMemo(() => `http://127.0.0.1:${effectivePort()}/v1`);
  const proxyStatus = createMemo(() => proxyStore.status());
  const proxyBusy = createMemo(() => proxyStatus() === "starting" || proxyStatus() === "stopping" || proxyStore.loading());
  const settingsError = createMemo(() => (settings as unknown as { error?: unknown }).error);

  const proxyStatusLabel = createMemo(() => {
    switch (proxyStatus()) {
      case "running":
        return `Running on port ${proxyStore.port() || effectivePort()}`;
      case "starting":
        return "Starting proxy";
      case "stopping":
        return "Stopping proxy";
      case "degraded":
        return "Running with warnings";
      case "crashed":
        return "Crashed, restart from here";
      case "stopped":
        return "Stopped";
    }
  });

  const proxyStatusTone = createMemo(() => {
    switch (proxyStatus()) {
      case "running":
        return "success";
      case "starting":
      case "stopping":
      case "degraded":
        return "warning";
      case "crashed":
        return "error";
      case "stopped":
        return "neutral";
    }
  });

  const proxyActionLabel = createMemo(() => {
    switch (proxyStatus()) {
      case "running":
        return "Stop proxy";
      case "starting":
        return "Starting";
      case "stopping":
        return "Stopping";
      case "crashed":
        return "Restart proxy";
      default:
        return "Start proxy";
    }
  });

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const current = settings.latest;
    if (!current) return;
    const updated = { ...current, [key]: value };
    setSaving(true);
    try {
      await invokeCompat<void>("update_settings", { settingsData: updated });
      refetch();
      toast.success("Setting saved");
    } catch (e: unknown) {
      toast.error(`Failed to save: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePortChange = (value: string) => {
    const port = Number.parseInt(value, 10);
    if (Number.isNaN(port)) {
      setPendingPort(null);
      return;
    }
    setPendingPort(port);
  };

  const portValid = createMemo(() => {
    const port = pendingPort();
    return port === null || (port >= 1024 && port <= 65535);
  });

  const portChanged = createMemo(() => {
    const port = pendingPort();
    return port !== null && port !== settings.latest?.proxyPort;
  });

  const savePort = async () => {
    const port = pendingPort();
    if (port === null || !portValid()) return;
    await updateSetting("proxyPort", port);
    setPendingPort(null);
  };

  const handleRestartWithNewPort = async () => {
    const port = pendingPort() ?? settings.latest?.proxyPort ?? DEFAULT_PROXY_PORT;
    if (!portValid()) {
      toast.error("Choose a port from 1024 to 65535");
      return;
    }

    try {
      await savePort();
      await proxyStore.restartProxy(port);
      toast.success(`Proxy restarted on port ${port}`);
    } catch (e: unknown) {
      toast.error(`Failed to restart proxy: ${String(e)}`);
    }
  };

  const toggleProxy = async () => {
    try {
      if (proxyStatus() === "running") {
        await proxyStore.stopProxy();
        toast.success("Proxy stopped");
      } else {
        await proxyStore.startProxy(effectivePort());
        toast.success(`Proxy started on port ${effectivePort()}`);
      }
    } catch (e: unknown) {
      toast.error(`Proxy action failed: ${String(e)}`);
    }
  };

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpointUrl());
      setCopiedEndpoint(true);
      toast.success("Endpoint copied");
      window.setTimeout(() => setCopiedEndpoint(false), 1600);
    } catch (e: unknown) {
      toast.error(`Copy failed: ${String(e)}`);
    }
  };

  const checkForUpdates = async () => {
    setChecking(true);
    setUpdateAvailable(null);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version, body: update.body ?? null });
      } else {
        toast.success("Aether is up to date");
      }
    } catch (e: unknown) {
      toast.error(`Update check failed: ${String(e)}`);
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
      const freshUpdate = await check();
      if (!freshUpdate) {
        toast.error("Update no longer available");
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await freshUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setUpdateProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setUpdateProgress(100);
            break;
        }
      });

      toast.success("Update installed. Relaunching.");
      await relaunch();
    } catch (e: unknown) {
      toast.error(`Update failed: ${String(e)}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10">
      <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-2xl">
          <p class="font-caption text-text-muted">Aether preferences</p>
          <h1 class="mt-1 font-title text-text">Settings</h1>
          <p class="mt-2 max-w-[65ch] font-body text-text-secondary">
            Diagnose the local proxy, confirm the endpoint your tools should use, and adjust app behavior without editing config files.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge variant={proxyStatusTone()}>{proxyStatusLabel()}</Badge>
          <Badge variant={portChanged() ? "warning" : "neutral"}>Port {effectivePort()}</Badge>
          <Badge variant={updateAvailable() ? "warning" : "neutral"}>{updateAvailable() ? "Update ready" : "App current"}</Badge>
        </div>
      </header>

      <Suspense fallback={<SettingsSkeleton />}>
        <Show when={!settingsError()} fallback={<SettingsError onRetry={refetch} />}>
          <section class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
            <GlassCard class="flex flex-col gap-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="font-section-header text-text-secondary">Proxy runtime</p>
                  <h2 class="mt-1 text-lg font-semibold text-text">{proxyStatusLabel()}</h2>
                  <p class="mt-2 max-w-[60ch] font-body text-text-secondary">
                    Controls the local OpenAI-compatible endpoint used by your AI tools.
                  </p>
                </div>
                <Button
                  variant={proxyStatus() === "running" ? "secondary" : "primary"}
                  onClick={toggleProxy}
                  loading={proxyBusy()}
                  loadingLabel={proxyActionLabel()}
                  disabled={proxyBusy() || !portValid()}
                >
                  {proxyActionLabel()}
                </Button>
              </div>

              <div class="grid gap-3 sm:grid-cols-3">
                <DiagnosticTile label="Runtime" value={proxyStatusLabel()} tone={proxyStatusTone()} />
                <DiagnosticTile label="Configured port" value={String(effectivePort())} tone={portChanged() ? "warning" : "neutral"} />
                <DiagnosticTile label="Client base URL" value="OpenAI compatible" tone="active" />
              </div>

              <div class="rounded-lg border border-border bg-bg-elevated p-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div class="min-w-0">
                    <p class="font-body font-medium text-text">Endpoint URL</p>
                    <p class="mt-1 font-caption text-text-muted">Use this in tools that accept an OpenAI-compatible base URL.</p>
                  </div>
                  <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <code class="min-w-0 select-all overflow-x-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-primary">
                      {endpointUrl()}
                    </code>
                    <Button variant="ghost" size="sm" onClick={copyEndpoint}>{copiedEndpoint() ? "Copied" : "Copy"}</Button>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border border-border bg-bg-elevated p-4">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <label class="min-w-0" for="proxy-port">
                    <span class="font-body font-medium text-text">Proxy port</span>
                    <span class="mt-1 block font-caption text-text-muted">Allowed range is 1024 to 65535. Clients use the new value after restart.</span>
                  </label>
                  <input
                    id="proxy-port"
                    type="number"
                    min="1024"
                    max="65535"
                    aria-invalid={!portValid()}
                    aria-describedby="proxy-port-help"
                    class="field w-full md:w-32"
                    value={effectivePort()}
                    onInput={(e) => handlePortChange(e.currentTarget.value)}
                  />
                </div>
                <p id="proxy-port-help" class={`mt-2 font-caption ${portValid() ? "text-text-muted" : "text-error"}`}>
                  {portValid() ? "Leave unchanged to keep existing AI client configuration working." : "Choose a port from 1024 to 65535."}
                </p>
                <Show when={portChanged() && portValid()}>
                  <div class="mt-4 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p class="font-body font-medium text-warning">Restart required before clients use this port</p>
                      <p class="mt-1 font-caption text-text-secondary">Aether will save the setting, then restart the proxy on port {effectivePort()}.</p>
                    </div>
                    <Button variant="primary" size="sm" onClick={handleRestartWithNewPort} loading={proxyBusy() || saving()} loadingLabel="Restarting">
                      Save and restart
                    </Button>
                  </div>
                </Show>
              </div>
            </GlassCard>

            <div class="flex flex-col gap-4">
              <GlassCard class="flex flex-col gap-4 p-5">
                <div>
                  <p class="font-section-header text-text-secondary">Startup and appearance</p>
                  <p class="mt-1 font-caption text-text-muted">Keep Aether ready without making the app feel busy.</p>
                </div>
                <SettingToggle
                  label="Auto-start proxy"
                  description="Start CLIProxyAPI when Aether launches."
                  checked={Boolean(settings.latest?.autoStartProxy)}
                  disabled={saving()}
                  onToggle={() => updateSetting("autoStartProxy", !settings.latest?.autoStartProxy)}
                />
                <SettingToggle
                  label="Launch at login"
                  description="Open Aether when macOS starts."
                  checked={Boolean(settings.latest?.launchAtLogin)}
                  disabled={saving()}
                  onToggle={() => updateSetting("launchAtLogin", !settings.latest?.launchAtLogin)}
                />
                <SettingToggle
                  label="Light appearance"
                  description="Switch between warm light and warm dark themes."
                  checked={themeStore.theme() === "light"}
                  disabled={saving()}
                  onToggle={() => {
                    const newTheme = themeStore.theme() === "dark" ? "light" : "dark";
                    themeStore.setTheme(newTheme);
                    updateSetting("theme", newTheme);
                  }}
                />
              </GlassCard>

              <GlassCard class="flex flex-col gap-4 p-5">
                <div>
                  <p class="font-section-header text-text-secondary">App maintenance</p>
                  <p class="mt-1 font-caption text-text-muted">Versions and updates for the desktop app and sidecar.</p>
                </div>
                <div class="space-y-3">
                  <VersionRow label="Aether" value={`v${versionInfo()?.appVersion ?? "..."}`} />
                  <VersionRow label="CLIProxyAPI" value={versionInfo()?.sidecarVersion ?? "..."} />
                </div>
                <div class="border-t border-border pt-4">
                  <Show when={!updateAvailable()} fallback={
                    <div class="space-y-3">
                      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0">
                          <p class="font-body font-medium text-text">Update available: v{updateAvailable()!.version}</p>
                          <Show when={updateAvailable()!.body}>
                            <p class="mt-1 line-clamp-3 font-caption text-text-muted">{updateAvailable()!.body}</p>
                          </Show>
                        </div>
                        <Button variant="primary" size="sm" onClick={installUpdate} loading={updating()} loadingLabel={`Installing ${updateProgress()}%`}>
                          Install update
                        </Button>
                      </div>
                      <Show when={updating()}>
                        <div class="h-1.5 overflow-hidden rounded-full bg-border" aria-label={`Installing update ${updateProgress()}%`}>
                          <div class="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${updateProgress()}%` }} />
                        </div>
                      </Show>
                    </div>
                  }>
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p class="font-body text-text-secondary">Check whether a newer Aether build is available.</p>
                      <Button variant="ghost" size="sm" onClick={checkForUpdates} loading={checking()} loadingLabel="Checking">
                        Check for updates
                      </Button>
                    </div>
                  </Show>
                </div>
              </GlassCard>
            </div>
          </section>
        </Show>
      </Suspense>
    </main>
  );
};

type DiagnosticTone = "active" | "success" | "warning" | "error" | "neutral";

interface DiagnosticTileProps {
  label: string;
  value: string;
  tone: DiagnosticTone;
}

const DiagnosticTile: Component<DiagnosticTileProps> = (props) => {
  const toneClass = () => {
    switch (props.tone) {
      case "active":
        return "border-primary/40 bg-primary/10 text-primary";
      case "success":
        return "border-success/30 bg-success/10 text-success";
      case "warning":
        return "border-warning/30 bg-warning/10 text-warning";
      case "error":
        return "border-error/30 bg-error/10 text-error";
      case "neutral":
        return "border-border bg-bg-elevated text-text-secondary";
    }
  };

  return (
    <div class={`rounded-lg border p-3 ${toneClass()}`}>
      <p class="font-caption uppercase tracking-[0.08em] opacity-80">{props.label}</p>
      <p class="mt-1 min-w-0 truncate font-body font-medium">{props.value}</p>
    </div>
  );
};

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

const SettingToggle: Component<SettingToggleProps> = (props) => {
  return (
    <div class="flex items-center justify-between gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div class="min-w-0">
        <p class="font-body font-medium text-text">{props.label}</p>
        <p class="mt-1 font-caption text-text-muted">{props.description}</p>
      </div>
      <button
        type="button"
        class="switch focus-ring"
        role="switch"
        aria-checked={props.checked ? "true" : "false"}
        aria-label={props.label}
        onClick={props.onToggle}
        disabled={props.disabled}
      >
        <span class="switch-thumb" />
      </button>
    </div>
  );
};

interface VersionRowProps {
  label: string;
  value: string;
}

const VersionRow: Component<VersionRowProps> = (props) => {
  return (
    <div class="flex items-center justify-between gap-4">
      <p class="font-body text-text-secondary">{props.label}</p>
      <code class="rounded-md border border-border bg-bg px-2 py-1 font-mono text-sm text-text">{props.value}</code>
    </div>
  );
};

interface SettingsErrorProps {
  onRetry: () => void;
}

const SettingsError: Component<SettingsErrorProps> = (props) => {
  return (
    <GlassCard class="flex flex-col items-center gap-3 py-10 text-center">
      <Badge variant="error">Settings unavailable</Badge>
      <div>
        <h2 class="font-title text-text">Could not load settings</h2>
        <p class="mt-2 max-w-md font-body text-text-secondary">Aether could not read the local settings file. Try again before changing proxy behavior.</p>
      </div>
      <Button variant="secondary" onClick={props.onRetry}>Retry</Button>
    </GlassCard>
  );
};

const SettingsSkeleton: Component = () => {
  return (
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]" aria-label="Loading settings">
      <GlassCard class="flex flex-col gap-5">
        <div class="space-y-3">
          <div class="skeleton h-4 w-28" />
          <div class="skeleton h-7 w-64" />
          <div class="skeleton h-4 w-full max-w-xl" />
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="skeleton h-20 rounded-lg" />
          <div class="skeleton h-20 rounded-lg" />
          <div class="skeleton h-20 rounded-lg" />
        </div>
        <div class="skeleton h-24 rounded-lg" />
        <div class="skeleton h-28 rounded-lg" />
      </GlassCard>
      <div class="flex flex-col gap-4">
        <GlassCard class="h-64"><div class="skeleton h-full rounded-lg" /></GlassCard>
        <GlassCard class="h-52"><div class="skeleton h-full rounded-lg" /></GlassCard>
      </div>
    </section>
  );
};

export default Settings;
