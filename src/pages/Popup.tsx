import type { Component } from "solid-js";
import { createSignal, Show, For } from "solid-js";
import { Window } from "@tauri-apps/api/window";
import { presetStore } from "../stores/presetStore";
import { proxyStore } from "../stores/proxyStore";

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

const IconCheck = (): ReturnType<Component> => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M2.5 7L5.5 10L11.5 4"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const IconSpinner = (): ReturnType<Component> => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    class="animate-spin"
  >
    <circle
      cx="7"
      cy="7"
      r="5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="20 10"
      stroke-linecap="round"
    />
  </svg>
);

const IconRefresh = (): ReturnType<Component> => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M12 7A5 5 0 1 1 7 2a5 5 0 0 1 3.54 1.46L12 5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M12 2v3h-3"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const IconCopy = (): ReturnType<Component> => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="5"
      y="5"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M2 9V3a1 1 0 0 1 1-1h6"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
);

const IconWindow = (): ReturnType<Component> => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="1"
      y="2"
      width="12"
      height="10"
      rx="1.5"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path d="M1 5h12" stroke="currentColor" stroke-width="1.5" />
    <circle cx="3.5" cy="3.5" r="0.75" fill="currentColor" />
    <circle cx="5.5" cy="3.5" r="0.75" fill="currentColor" />
  </svg>
);

const IconPlay = (): ReturnType<Component> => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M3 2.5l8 4.5-8 4.5V2.5z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// Popup component
// ---------------------------------------------------------------------------

const Popup: Component = () => {
  const [switchingPreset, setSwitchingPreset] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  const presets = () => presetStore.presets() ?? [];
  const activePreset = () => presets().find((p) => p.active);
  const proxyStatus = () => proxyStore.status();
  const proxyPort = () => proxyStore.port();

  const isStopped = () => proxyStatus() === "stopped" || proxyStatus() === "crashed";
  const isStarting = () =>
    proxyStatus() === "starting" || proxyStatus() === "restarting";

  async function handleActivatePreset(name: string) {
    if (switchingPreset() !== null) return;
    setSwitchingPreset(name);
    try {
      await presetStore.activatePreset(name);
    } finally {
      setSwitchingPreset(null);
    }
  }

  async function handleProxyAction() {
    if (isStopped()) {
      await proxyStore.startProxy();
    } else {
      await proxyStore.restartProxy();
    }
  }

  async function handleCopyEndpoint() {
    const url = `http://localhost:${proxyPort()}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleOpenMainWindow() {
    const win = await Window.getByLabel("main");
    if (win) {
      await win.show();
      await win.setFocus();
    }
  }

  // Status dot color
  const statusDotClass = () => {
    switch (proxyStatus()) {
      case "running":
        return "bg-success";
      case "starting":
      case "restarting":
        return "bg-warning";
      default:
        return "bg-error";
    }
  };

  const statusLabel = () => {
    switch (proxyStatus()) {
      case "running":
        return "Running";
      case "starting":
        return "Starting";
      case "restarting":
        return "Restarting";
      case "crashed":
        return "Crashed";
      default:
        return "Stopped";
    }
  };

  return (
    <div
      class="w-80 max-h-[400px] flex flex-col rounded-xl overflow-hidden glass shadow-glass"
      style={{ "min-width": "320px" }}
    >
      {/* Proxy stopped warning banner */}
      <Show when={isStopped()}>
        <div class="px-3 py-2 bg-warning/10 border-b border-border flex items-center gap-2">
          <div class="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
          <span class="font-caption text-warning">Proxy is not running</span>
        </div>
      </Show>

      {/* Active preset header */}
      <div class="px-3 py-2.5 flex items-center justify-between border-b border-border flex-shrink-0">
        <div class="flex flex-col gap-0.5">
          <span class="font-micro text-text-secondary uppercase tracking-wider">
            Active Preset
          </span>
          <span class="font-body text-text font-medium">
            {activePreset()?.name ?? "None"}
          </span>
        </div>
        <Show when={activePreset()}>
          <span class="px-1.5 py-0.5 rounded font-micro bg-success/15 text-success">
            ACTIVE
          </span>
        </Show>
      </div>

      {/* Preset list — scrollable */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <For each={presets()}>
          {(preset) => {
            const isSwitching = () => switchingPreset() === preset.name;
            const isDisabled = () =>
              switchingPreset() !== null && switchingPreset() !== preset.name;

            return (
              <button
                type="button"
                class="w-full flex items-center justify-between px-3 h-10 text-left transition-colors"
                classList={{
                  "opacity-40 cursor-not-allowed": isDisabled(),
                  "hover:bg-white/5 cursor-pointer": !isDisabled(),
                  "bg-white/5": preset.active,
                }}
                disabled={isDisabled()}
                onClick={() => handleActivatePreset(preset.name)}
              >
                <span
                  class="font-body truncate"
                  classList={{
                    "text-text": preset.active,
                    "text-text-secondary": !preset.active,
                  }}
                >
                  {preset.name}
                </span>
                <span class="flex-shrink-0 ml-2 text-success">
                  <Show when={isSwitching()}>
                    <IconSpinner />
                  </Show>
                  <Show when={!isSwitching() && preset.active}>
                    <IconCheck />
                  </Show>
                </span>
              </button>
            );
          }}
        </For>

        <Show when={presets().length === 0}>
          <div class="px-3 py-4 text-center">
            <span class="font-caption text-text-secondary">No presets found</span>
          </div>
        </Show>
      </div>

      {/* Quick actions */}
      <div class="border-t border-border flex-shrink-0">
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 h-9 hover:bg-white/5 transition-colors text-left"
          classList={{
            "opacity-50 cursor-not-allowed": proxyStore.loading(),
          }}
          disabled={proxyStore.loading()}
          onClick={handleProxyAction}
        >
          <span class="text-text-secondary">
            <Show when={isStarting()}>
              <IconSpinner />
            </Show>
            <Show when={!isStarting()}>
              <Show when={isStopped()} fallback={<IconRefresh />}>
                <IconPlay />
              </Show>
            </Show>
          </span>
          <span class="font-caption text-text-secondary">
            <Show when={isStopped()} fallback="Restart Proxy">
              Start Proxy
            </Show>
          </span>
        </button>

        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 h-9 hover:bg-white/5 transition-colors text-left"
          onClick={handleCopyEndpoint}
        >
          <span class="text-text-secondary">
            <IconCopy />
          </span>
          <span class="font-caption text-text-secondary">
            <Show when={copied()} fallback="Copy Endpoint">
              Copied!
            </Show>
          </span>
        </button>

        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 h-9 hover:bg-white/5 transition-colors text-left"
          onClick={handleOpenMainWindow}
        >
          <span class="text-text-secondary">
            <IconWindow />
          </span>
          <span class="font-caption text-text-secondary">Open Main Window</span>
        </button>
      </div>

      {/* Status footer */}
      <div class="border-t border-border px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          classList={{ [statusDotClass()]: true }}
        />
        <span class="font-micro text-text-secondary">{statusLabel()}</span>
        <span class="font-micro text-text-muted mx-1">·</span>
        <span class="font-micro text-text-secondary font-mono">
          :{proxyPort()}
        </span>
        <span class="font-micro text-text-muted mx-1">·</span>
        <span class="font-micro text-text-secondary font-mono truncate">
          localhost:{proxyPort()}
        </span>
      </div>
    </div>
  );
};

export default Popup;
