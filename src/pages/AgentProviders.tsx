import type { Component } from "solid-js";
import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { agentProviderStore, type AgentProviderInfo, type WellKnownProvider } from "../stores/agentProviderStore";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Input from "../components/Input";
import Badge from "../components/Badge";
import { useToast } from "../components/Toast";
import ProviderPresetSelector from "../components/ProviderPresetSelector";
import { providerPresets } from "../config/providerPresets";
import {
  providerSwitchStore,
  type SwitchAppId,
  type SwitchProvider,
} from "../stores/providerSwitchStore";

// ---------------------------------------------------------------------------
// Add / Edit Provider Modal
// ---------------------------------------------------------------------------

interface ProviderModalProps {
  open: boolean;
  onClose: () => void;
  editProvider?: AgentProviderInfo;
  activeApp: SwitchAppId;
  onSuccess: () => void;
}

interface SwitchSyncPayload {
  provider: SwitchProvider;
  exists: boolean;
}

const ProviderModal: Component<ProviderModalProps> = (props) => {
  const { toast } = useToast();

  const [id, setId] = createSignal("");
  const [name, setName] = createSignal("");
  const [baseUrl, setBaseUrl] = createSignal("");
  const [compatibility, setCompatibility] = createSignal<"openai" | "anthropic">("openai");
  const [modelsEndpoint, setModelsEndpoint] = createSignal(true);
  const [apiKey, setApiKey] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [validating, setValidating] = createSignal(false);
  const [validated, setValidated] = createSignal<boolean | null>(null);
  const [error, setError] = createSignal("");
  const [showKey, setShowKey] = createSignal(false);
  const [selectedPresetId, setSelectedPresetId] = createSignal<string | null>(null);
  const [templateRegion, setTemplateRegion] = createSignal("");
  const [syncWarning, setSyncWarning] = createSignal("");
  const [syncRetrying, setSyncRetrying] = createSignal(false);
  const [pendingSyncPayload, setPendingSyncPayload] = createSignal<SwitchSyncPayload | null>(null);

  // Reset when modal opens / edit target changes
  createEffect(() => {
    if (props.open) {
      const ep = props.editProvider;
      if (ep) {
        setId(ep.id);
        setName(ep.name);
        setBaseUrl(ep.baseUrl);
        setCompatibility(ep.compatibility);
        setModelsEndpoint(ep.modelsEndpoint);
        setShowKey(false);
        agentProviderStore.fetchKey(ep.id).then((k) => setApiKey(k ?? ""));
        setValidated(null);
        setError("");
        setSelectedPresetId("custom");
        setTemplateRegion("");
        setSyncWarning("");
        setPendingSyncPayload(null);
      } else {
        setId("");
        setName("");
        setBaseUrl("");
        setCompatibility("openai");
        setModelsEndpoint(true);
        setApiKey("");
        setShowKey(false);
        setValidated(null);
        setError("");
        setSelectedPresetId("custom");
        setTemplateRegion("");
        setSyncWarning("");
        setPendingSyncPayload(null);
      }
    }
  });

  const isEditing = () => !!props.editProvider;
  const selectedAppPreset = () =>
    providerPresets.find(
      (item) => item.id === selectedPresetId() && item.app === props.activeApp,
    );

  const retrySwitchSync = async () => {
    const payload = pendingSyncPayload();
    if (!payload) return;
    setSyncRetrying(true);
    setSyncWarning("");
    try {
      if (payload.exists) {
        await providerSwitchStore.update(props.activeApp, payload.provider);
      } else {
        await providerSwitchStore.add(props.activeApp, payload.provider, props.activeApp === "opencode");
      }
      setPendingSyncPayload(null);
      toast.success("Provider sync recovered");
      props.onSuccess();
      props.onClose();
    } catch (e: unknown) {
      setSyncWarning(`Provider saved, but sync retry failed: ${String(e)}`);
    } finally {
      setSyncRetrying(false);
    }
  };

  const handleValidate = async () => {
    if (!baseUrl().trim() || !apiKey().trim()) return;
    setValidating(true);
    setValidated(null);
    setError("");
    try {
      const ok = await agentProviderStore.validateKey(
        baseUrl().trim(),
        compatibility(),
        apiKey().trim(),
      );
      setValidated(ok);
      if (!ok) setError("API key appears to be invalid for this provider");
    } catch (e: unknown) {
      setValidated(false);
      setError(String(e));
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!name().trim() || !baseUrl().trim()) return;
    if (!isEditing() && !id().trim()) return;
    const preset = selectedAppPreset();
    if (preset?.templateFields?.some((f) => f.key === "region" && f.required)) {
      if (!templateRegion().trim()) {
        setError("Gateway Region is required for selected preset");
        return;
      }
    }
    setSaving(true);
    setError("");
    setSyncWarning("");
    setPendingSyncPayload(null);
    try {
      const selectedPreset = providerPresets.find((item) => item.id === selectedPresetId());
      if (isEditing()) {
        await agentProviderStore.updateProvider({
          id: id(),
          name: name().trim(),
          baseUrl: baseUrl().trim(),
          compatibility: compatibility(),
          modelsEndpoint: modelsEndpoint(),
          apiKey: apiKey().trim() || undefined,
        });
        toast.success(`${name()} updated`);
      } else {
        await agentProviderStore.addProvider({
          id: id().trim(),
          name: name().trim(),
          baseUrl: baseUrl().trim(),
          compatibility: compatibility(),
          modelsEndpoint: modelsEndpoint(),
          apiKey: apiKey().trim() || undefined,
        });
        toast.success(`${name()} added`);
      }

      // Keep switch-provider surface in sync with managed provider registry
      const switchProvider: SwitchProvider = {
        id: id().trim() || props.editProvider?.id || name().toLowerCase().replace(/\s+/g, "-"),
        name: name().trim(),
        app: props.activeApp,
        category: selectedPreset?.category ?? "custom",
        settingsConfig: {
          env: {
            BASE_URL: baseUrl().trim(),
          },
        },
        meta: {
          compatibility: compatibility(),
          modelsEndpoint: modelsEndpoint(),
          presetId: selectedPresetId() ?? "custom",
          liveConfigManaged: props.activeApp === "opencode" ? true : undefined,
        },
      };

      let switchSyncFailed = false;
      let switchSyncErrorMessage = "";
      try {
        const all = await providerSwitchStore.getAll(props.activeApp);
        const exists = Boolean(all[switchProvider.id]);
        setPendingSyncPayload({ provider: switchProvider, exists });
        if (exists) {
          await providerSwitchStore.update(props.activeApp, switchProvider);
        } else {
          await providerSwitchStore.add(
            props.activeApp,
            switchProvider,
            props.activeApp === "opencode",
          );
        }
      } catch (syncError: unknown) {
        switchSyncFailed = true;
        switchSyncErrorMessage = String(syncError);
      }

      if (switchSyncFailed) {
        setSyncWarning(`Provider saved, but switch sync failed: ${switchSyncErrorMessage}`);
        toast.warning("Provider saved with sync issue. Retry switch sync below.");
        props.onSuccess();
        return;
      }

      setPendingSyncPayload(null);

      props.onSuccess();
      props.onClose();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: WellKnownProvider) => {
    setId(preset.id);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setCompatibility(preset.compatibility);
    setModelsEndpoint(preset.modelsEndpoint);
    setValidated(null);
    setError("");
  };

  const resolveTemplate = (template: string) => {
    return template.replace(/\$\{region\}/g, templateRegion().trim());
  };

  const applyAppPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === "custom") return;
    const preset = providerPresets.find((item) => item.id === presetId && item.app === props.activeApp);
    if (!preset) return;
    setName(preset.name);
    setBaseUrl(resolveTemplate(preset.baseUrlTemplate));
    setCompatibility(preset.compatibility);
    setModelsEndpoint(preset.modelsEndpoint);
    setValidated(null);
    setError("");
  };

  const sectionDivider = (label: string) => (
    <div class="flex items-center gap-3" aria-hidden="true">
      <div class="h-px flex-1 bg-border" />
      <span class="font-caption text-xs text-text-muted">{label}</span>
      <div class="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={isEditing() ? `Edit ${props.editProvider?.name}` : "Add Provider"}
      size="lg"
      footer={
        <div class="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              (!isEditing() && (!id().trim() || !name().trim() || !baseUrl().trim())) ||
              (isEditing() && (!name().trim() || !baseUrl().trim())) ||
              saving()
            }
          >
            {saving() ? "Saving..." : isEditing() ? "Update" : "Add Provider"}
          </Button>
        </div>
      }
    >
      <div class="space-y-4">
        <ProviderPresetSelector
          app={props.activeApp}
          presets={providerPresets}
          selectedPresetId={selectedPresetId()}
          onSelectPreset={applyAppPreset}
        />

        <Show when={selectedPresetId() === "regional-gateway"}>
          <Input
            label="Gateway Region"
            value={templateRegion()}
            placeholder="sg"
            onInput={(v: string) => {
              setTemplateRegion(v);
              const preset = providerPresets.find((item) => item.id === "regional-gateway");
              if (preset) setBaseUrl(resolveTemplate(preset.baseUrlTemplate));
            }}
            class="!border-border-strong"
          />
        </Show>

        <Show when={!isEditing() && agentProviderStore.wellKnown().length > 0}>
          <div>
            <p class="mb-1.5 font-caption text-xs text-text-muted">Known providers</p>
            <div class="flex flex-wrap gap-1.5">
              <For each={agentProviderStore.wellKnown()}>
                {(preset) => (
                  <button
                    type="button"
                    class="rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {sectionDivider("Identity")}

        <div class={`grid gap-3 ${!isEditing() ? "sm:grid-cols-2" : ""}`}>
          <Show when={!isEditing()}>
            <Input
              label="Provider ID"
              value={id()}
              onInput={(v: string) => setId(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="groq"
              class="!border-border-strong"
            />
          </Show>
          <Input
            label="Display Name"
            value={name()}
            onInput={setName}
            placeholder="Groq"
            class={`!border-border-strong${isEditing() ? " col-span-full" : ""}`}
          />
        </div>

        {sectionDivider("Connection")}

        <Input
          label="Base URL"
          value={baseUrl()}
          onInput={(v: string) => { setBaseUrl(v); setValidated(null); }}
          placeholder="https://api.groq.com/openai/v1"
          class="!border-border-strong"
        />

        <div>
          <label class="mb-1.5 block font-caption text-xs text-text-secondary">API Compatibility</label>
          <div class="inline-flex rounded-lg border border-border-strong bg-bg-surface p-0.5">
            <For each={["openai", "anthropic"] as const}>
              {(compat) => (
                <button
                  type="button"
                  class={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    compatibility() === compat
                      ? "bg-primary/20 text-text shadow-sm"
                      : "text-text-secondary hover:text-text"
                  }`}
                  onClick={() => setCompatibility(compat)}
                >
                  {compat === "openai" ? "OpenAI" : "Anthropic"}
                </button>
              )}
            </For>
          </div>
        </div>

        {sectionDivider("Authentication")}

        <div class="flex items-end gap-2">
          <div class="flex-1">
            <Input
              label={isEditing() ? "New API Key (optional)" : "API Key"}
              type={showKey() ? "text" : "password"}
              value={apiKey()}
              onInput={(v: string) => { setApiKey(v); setValidated(null); }}
              placeholder={isEditing() ? "Enter new key to replace..." : "sk-..."}
              class="!border-border-strong"
            />
          </div>
          <Show when={apiKey().length > 0}>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              class="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-strong bg-bg-elevated text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={showKey() ? "Hide API key" : "Show API key"}
            >
              <Show
                when={showKey()}
                fallback={
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </Show>
            </button>
          </Show>
          <Button
            variant="ghost"
            size="sm"
            class="mb-0.5 shrink-0"
            onClick={handleValidate}
            disabled={!baseUrl().trim() || !apiKey().trim() || validating()}
          >
            {validating() ? "Checking..." : "Validate"}
          </Button>
        </div>

        <Show when={validated() !== null}>
          <div class="flex items-center gap-2">
            <Show when={validated() === true}>
              <Badge variant="active">Key verified</Badge>
            </Show>
            <Show when={validated() === false}>
              <Badge variant="warning">Verification failed — you can still save</Badge>
            </Show>
          </div>
        </Show>

        <div class="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={modelsEndpoint()}
            onClick={() => setModelsEndpoint((v) => !v)}
            class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              modelsEndpoint() ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              class={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                modelsEndpoint() ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
          <span class="font-caption text-sm text-text-secondary">
            Fetch model list from <code class="font-mono text-xs text-text-muted">/models</code>
          </span>
        </div>

        <Show when={error()}>
          <p class="font-caption text-sm text-status-error">{error()}</p>
        </Show>

        <Show when={syncWarning()}>
          <div class="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3">
            <p class="font-caption text-sm text-text-secondary">{syncWarning()}</p>
            <p class="mt-1 font-caption text-xs text-text-muted">Provider config is stored. Retry sync so it appears in switch flows.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={retrySwitchSync} disabled={syncRetrying() || !pendingSyncPayload()}>
                {syncRetrying() ? "Retrying..." : "Retry sync"}
              </Button>
              <Button size="sm" variant="ghost" onClick={props.onClose}>Close for now</Button>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Provider rows
// ---------------------------------------------------------------------------

interface ProviderRowProps {
  provider: AppProviderView;
  active: boolean;
  inConfig: boolean;
  additiveMode: boolean;
  primaryLabel: string;
  onPrimaryAction: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onFetchModels: (id: string) => void;
  fetchingModels: boolean;
  rowError?: { kind: "primary" | "fetch-models" | "delete"; message: string };
  actionPending?: { kind: "primary" | "fetch-models" | "delete"; loading: boolean };
  onRetryAction?: () => void;
}

interface AppProviderView {
  id: string;
  name: string;
  baseUrl: string;
  compatibility: "openai" | "anthropic";
  modelsEndpoint: boolean;
  models: string[];
  hasKey: boolean;
  category?: string;
  switchProvider: SwitchProvider;
  inConfig: boolean;
}

const ProviderItemRow: Component<ProviderRowProps> = (props) => {
  const iconBtn = "flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div class="rounded-xl border border-border bg-bg-elevated/40 px-4 py-3.5 transition-colors hover:border-border-strong hover:bg-bg-elevated/60">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <p class="truncate font-medium text-text">{props.provider.name}</p>
            <Badge variant={props.provider.compatibility === "openai" ? "openai" : "anthropic"}>{props.provider.compatibility}</Badge>
            <Show when={props.active}>
              <Badge variant="active">Active</Badge>
            </Show>
            <Show when={props.inConfig && !props.active}>
              <Badge variant="neutral">In config</Badge>
            </Show>
            <Show when={!props.provider.hasKey}>
              <Badge variant="warning">No key</Badge>
            </Show>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-muted">{props.provider.id}</span>
            <p class="truncate font-mono text-xs text-text-muted">{props.provider.baseUrl}</p>
          </div>
          <Show when={props.provider.models.length > 0}>
            <p class="font-caption text-xs text-text-muted">
              {props.provider.models.length} model{props.provider.models.length === 1 ? "" : "s"}
            </p>
          </Show>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button
            class={iconBtn}
            title={props.fetchingModels ? "Fetching models..." : "Fetch models"}
            aria-label={`Fetch models for ${props.provider.name}`}
            onClick={() => props.onFetchModels(props.provider.id)}
            disabled={props.fetchingModels || !props.provider.modelsEndpoint || !props.provider.hasKey || Boolean(props.actionPending?.loading)}
          >
            <Show
              when={props.fetchingModels || (props.actionPending?.kind === "fetch-models" && props.actionPending.loading)}
              fallback={
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </Show>
          </button>

          <button
            class={iconBtn}
            title="Edit provider"
            aria-label={`Edit ${props.provider.name}`}
            onClick={() => props.onEdit(props.provider.id)}
            disabled={Boolean(props.actionPending?.loading)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>

          <button
            class={`${iconBtn} hover:text-status-error`}
            title="Delete provider"
            aria-label={`Delete ${props.provider.name}`}
            onClick={() => props.onDelete(props.provider.id)}
            disabled={Boolean(props.actionPending?.loading)}
          >
            <Show
              when={props.actionPending?.kind === "delete" && props.actionPending.loading}
              fallback={
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              }
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </Show>
          </button>

          <div class="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <Button
            size="sm"
            variant={props.active && !props.additiveMode ? "ghost" : "primary"}
            onClick={props.onPrimaryAction}
            disabled={(props.active && !props.additiveMode) || Boolean(props.actionPending?.loading)}
            aria-label={`${props.primaryLabel} ${props.provider.name}`}
          >
            {props.actionPending?.kind === "primary" && props.actionPending.loading ? "Working..." : props.primaryLabel}
          </Button>
        </div>
      </div>

      <Show when={props.rowError}>
        {(err) => (
          <div class="mt-3 flex items-start justify-between gap-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2">
            <p class="font-caption text-xs text-text-secondary">{err().message}</p>
            <Show when={props.onRetryAction}>
              <Button size="sm" variant="ghost" class="shrink-0" onClick={props.onRetryAction} disabled={Boolean(props.actionPending?.loading)}>
                Retry
              </Button>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const AgentProviders: Component = () => {
  const { toast } = useToast();
  const [activeApp, setActiveApp] = createSignal<SwitchAppId>("opencode");
  const [currentProviderId, setCurrentProviderId] = createSignal("");
  const [switchMeta, setSwitchMeta] = createSignal<Record<string, { inConfig: boolean }>>({});
  const [appProviders, setAppProviders] = createSignal<AppProviderView[]>([]);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<AgentProviderInfo | undefined>(undefined);
  const [fetchingId, setFetchingId] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");
  const [sortPref, setSortPrefSignal] = createSignal<"name" | "compat">("name");
  const [loadError, setLoadError] = createSignal("");
  const [bootstrapping, setBootstrapping] = createSignal(false);
  const [bootstrapNotice, setBootstrapNotice] = createSignal("");
  const [actionErrors, setActionErrors] = createSignal<Record<string, { kind: "primary" | "fetch-models" | "delete"; message: string }>>({});
  const [actionPending, setActionPending] = createSignal<Record<string, { kind: "primary" | "fetch-models" | "delete"; loading: boolean }>>({});
  let lastModelsToastAt = 0;

  const appLabels: Record<SwitchAppId, string> = {
    opencode: "OpenCode",
    claude: "Claude Code",
    codex: "Codex CLI",
    gemini: "Gemini CLI",
  };

  const refreshSwitchState = async () => {
    try {
      setCurrentProviderId(await providerSwitchStore.getCurrent(activeApp()));
      const all = await providerSwitchStore.getAll(activeApp());
      const registryById = new Map(agentProviderStore.providers().map((provider) => [provider.id, provider]));
      const scopedProviders: AppProviderView[] = Object.values(all).map((provider) => {
        const baseUrlFromConfig =
          (provider.settingsConfig as { env?: { BASE_URL?: string } } | undefined)?.env?.BASE_URL ?? "";
        const registry = registryById.get(provider.id);
        const meta = (provider.meta as {
          compatibility?: string;
          modelsEndpoint?: boolean;
          hasInlineApiKey?: boolean;
          liveConfigManaged?: boolean;
        } | undefined) ?? {};
        return {
          id: provider.id,
          name: provider.name,
          baseUrl: registry?.baseUrl || baseUrlFromConfig,
          compatibility: (registry?.compatibility ?? meta.compatibility ?? "openai") as "openai" | "anthropic",
          modelsEndpoint: registry?.modelsEndpoint ?? Boolean(meta.modelsEndpoint),
          models: registry?.models ?? [],
          hasKey: registry?.hasKey ?? Boolean(meta.hasInlineApiKey),
          category: provider.category,
          switchProvider: provider,
          inConfig: Boolean(meta.liveConfigManaged),
        };
      });
      setAppProviders(scopedProviders);

      const meta: Record<string, { inConfig: boolean }> = {};
      Object.values(all).forEach((provider) => {
        meta[provider.id] = {
          inConfig: Boolean((provider.meta as { liveConfigManaged?: boolean } | undefined)?.liveConfigManaged),
        };
      });
      setSwitchMeta(meta);
      setLoadError("");
    } catch {
      setSwitchMeta({});
      setAppProviders([]);
      setLoadError("Provider switch state could not be refreshed");
    }
  };

  const runBootstrapImports = async () => {
    try {
      const importedDefault = await providerSwitchStore.importDefault(activeApp());
      const importedLiveCount =
        activeApp() === "opencode" ? 0 : await providerSwitchStore.importFromLive(activeApp());
      if (importedDefault || importedLiveCount > 0) {
        await providerSwitchStore.updateTrayMenu();
        await agentProviderStore.refresh();
      }
    } catch {
      // best-effort bootstrap only
      setBootstrapNotice("Some provider sources could not be imported. You can continue and retry import.");
    }
  };

  const clearRowActionState = (providerId: string) => {
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    setActionPending((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  };

  const setRowActionPending = (providerId: string, kind: "primary" | "fetch-models" | "delete", loading: boolean) => {
    setActionPending((prev) => ({ ...prev, [providerId]: { kind, loading } }));
  };

  const setRowActionError = (providerId: string, kind: "primary" | "fetch-models" | "delete", message: string) => {
    setActionErrors((prev) => ({ ...prev, [providerId]: { kind, message } }));
  };

  const reloadProviderSurface = async () => {
    setBootstrapping(true);
    setLoadError("");
    setBootstrapNotice("");
    const stepErrors: string[] = [];

    try {
      await agentProviderStore.refresh();
    } catch {
      stepErrors.push("provider registry");
    }
    try {
      await agentProviderStore.loadWellKnown();
    } catch {
      stepErrors.push("well-known presets");
    }
    try {
      await agentProviderStore.loadModeMatrix();
    } catch {
      stepErrors.push("mode matrix");
    }
    try {
      await runBootstrapImports();
    } catch {
      stepErrors.push("bootstrap imports");
    }
    try {
      await refreshSwitchState();
    } catch {
      stepErrors.push("switch state");
    }

    if (stepErrors.length > 0) {
      if (stepErrors.length < 5) {
        setBootstrapNotice(`Partially loaded. Retry recommended for: ${stepErrors.join(", ")}.`);
      } else {
        setLoadError("Providers could not be loaded. Retry to recover.");
      }
    }

    setBootstrapping(false);
  };

  onMount(() => {
    let unlistenSwitch: (() => void) | undefined;
    let unlistenTray: (() => void) | undefined;
    let unlistenModelsRefreshed: (() => void) | undefined;
    let unlistenOpenCodeWarning: (() => void) | undefined;
    onCleanup(() => {
      unlistenSwitch?.();
      unlistenTray?.();
      unlistenModelsRefreshed?.();
      unlistenOpenCodeWarning?.();
    });

    void (async () => {
      try {
        await reloadProviderSurface();

        unlistenSwitch = await providerSwitchStore.onSwitched(async (event) => {
          if (event.appType !== activeApp()) return;
          setCurrentProviderId(event.providerId);
          await refreshSwitchState();
          await agentProviderStore.refresh();
        });

        unlistenTray = await providerSwitchStore.onTrayMenuUpdated(async () => {
          await refreshSwitchState();
          await agentProviderStore.refresh();
        });

        unlistenModelsRefreshed = await providerSwitchStore.onOpenCodeModelsRefreshed(() => {
          const now = Date.now();
          if (now - lastModelsToastAt < 800) return;
          lastModelsToastAt = now;
          toast.success("Model list updated.");
        });

        unlistenOpenCodeWarning = await providerSwitchStore.onOpenCodeConfigWarning((event) => {
          toast.warning(event.message || "OpenCode config warning");
        });
      } catch {
        setLoadError("Providers could not be loaded");
      }
    })();
  });

  const [surfaceInitialized, setSurfaceInitialized] = createSignal(false);

  createEffect(() => {
    const stored = localStorage.getItem(`aether.providers.sort.${activeApp()}`);
    setSortPrefSignal(stored === "compat" ? "compat" : "name");

    if (!surfaceInitialized()) {
      setSurfaceInitialized(true);
      return;
    }

    void (async () => {
      setBootstrapping(true);
      setBootstrapNotice("");
      try {
        await runBootstrapImports();
        await refreshSwitchState();
      } catch {
        setBootstrapNotice("Provider state could not fully refresh for this app context.");
      } finally {
        setBootstrapping(false);
      }
    })();
  });

  const filteredProviders = () => {
    const scoped = appProviders();

    const q = search().toLowerCase().trim();
    if (!q) return scoped;
    return scoped.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q),
    );
  };

  const sortedProviders = () => {
    const providers = [...filteredProviders()];
    const pref = sortPref();
    providers.sort((a, b) => {
      if (pref === "compat") {
        const byCompat = a.compatibility.localeCompare(b.compatibility);
        if (byCompat !== 0) return byCompat;
      }
      return a.name.localeCompare(b.name);
    });
    return providers;
  };

  const setSortPref = (pref: "name" | "compat") => {
    localStorage.setItem(`aether.providers.sort.${activeApp()}`, pref);
    setSortPrefSignal(pref);
  };

  const handleAdd = () => {
    setEditTarget(undefined);
    setModalOpen(true);
  };

  const handleEdit = (id: string) => {
    const registry = agentProviderStore.providers().find((provider) => provider.id === id);
    const scoped = appProviders().find((provider) => provider.id === id);
    if (!scoped) return;

    setEditTarget(
      registry ?? {
        id: scoped.id,
        name: scoped.name,
        baseUrl: scoped.baseUrl,
        compatibility: scoped.compatibility,
        modelsEndpoint: scoped.modelsEndpoint,
        models: scoped.models,
        headers: {},
        hasKey: scoped.hasKey,
      },
    );
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const p = appProviders().find((provider) => provider.id === id);
    if (!p) return;
    const msg = `Remove provider "${p.name}" from ${appLabels[activeApp()]}?`;
    if (!window.confirm(msg)) return;
    clearRowActionState(id);
    setRowActionPending(id, "delete", true);
    try {
      await providerSwitchStore.delete(activeApp(), id);
      await refreshSwitchState();
      toast.success(`${p.name} removed from ${appLabels[activeApp()]}`);
      clearRowActionState(id);
    } catch (e: unknown) {
      toast.error(`Failed to delete: ${String(e)}`);
      setRowActionError(id, "delete", `Delete failed: ${String(e)}. Retry when ready.`);
    } finally {
      setRowActionPending(id, "delete", false);
    }
  };

  const handleFetchModels = async (id: string) => {
    setFetchingId(id);
    clearRowActionState(id);
    setRowActionPending(id, "fetch-models", true);
    try {
      const models = await agentProviderStore.fetchModels(id);
      toast.success(`Fetched ${models.length} models`);
      clearRowActionState(id);
    } catch (e: unknown) {
      toast.error(`Failed to fetch models: ${String(e)}`);
      setRowActionError(id, "fetch-models", `Model fetch failed: ${String(e)}. Check key/base URL, then retry.`);
    } finally {
      setFetchingId(null);
      setRowActionPending(id, "fetch-models", false);
    }
  };

  const isAdditiveMode = () => activeApp() === "opencode";

  const primaryActionLabel = (provider: AppProviderView) => {
    if (isAdditiveMode()) {
      return switchMeta()[provider.id]?.inConfig ? "In use" : "Use this provider";
    }
    return currentProviderId() === provider.id ? "In use" : "Enable";
  };

  const currentProviderName = () => {
    if (isAdditiveMode()) {
      const inUseCount = appProviders().filter((provider) => switchMeta()[provider.id]?.inConfig).length;
      return inUseCount > 0 ? `${inUseCount} providers` : "None selected";
    }
    const current = appProviders().find((provider) => provider.id === currentProviderId());
    return (current?.name ?? currentProviderId()) || "None selected";
  };

  const currentModeCopy = () => (isAdditiveMode() ? "Additive mode" : "Exclusive mode");

  const handlePrimaryAction = async (provider: AppProviderView) => {
    clearRowActionState(provider.id);
    setRowActionPending(provider.id, "primary", true);
    try {
      const result = await providerSwitchStore.switch(activeApp(), provider.id);
      if (result.warnings?.length) {
        toast.warning(result.warnings.join("; "));
      }
      if (isAdditiveMode()) {
        const nowInUse = !Boolean(switchMeta()[provider.id]?.inConfig);
        setSwitchMeta((prev) => ({ ...prev, [provider.id]: { inConfig: nowInUse } }));
        toast.success(nowInUse ? `${provider.name} in use` : `${provider.name} removed from use`);
      } else {
        setCurrentProviderId(provider.id);
        toast.success(`${provider.name} enabled`);
      }
      clearRowActionState(provider.id);
    } catch (e: unknown) {
      toast.error(`Action failed: ${String(e)}`);
      setRowActionError(provider.id, "primary", `Switch action failed: ${String(e)}. Retry to reapply routing.`);
    } finally {
      setRowActionPending(provider.id, "primary", false);
    }
  };


  return (
    <div class="space-y-5">
      <section class="rounded-2xl border border-border bg-bg-elevated/40 p-5 md:p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <h1 class="font-title text-text">Provider switch</h1>
            <p class="font-body text-text-secondary">Route each AI tool through the provider of your choice.</p>
          </div>
          <Button variant="primary" onClick={handleAdd} class="shrink-0 whitespace-nowrap">
            Add Provider
          </Button>
        </div>

        <div class="mt-5 space-y-3">
          <div>
            <p class="mb-2 font-caption text-xs text-text-muted">App context</p>
            <div class="inline-flex rounded-lg border border-border-strong bg-bg-surface p-0.5">
              <For each={["opencode", "claude", "codex", "gemini"] as SwitchAppId[]}>
                {(app) => (
                  <button
                    class={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      activeApp() === app
                        ? "bg-primary/20 text-text shadow-sm"
                        : "text-text-secondary hover:text-text"
                    }`}
                    onClick={() => setActiveApp(app)}
                  >
                    {appLabels[app]}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="flex items-center justify-between rounded-xl border border-border bg-bg-surface/60 px-4 py-3">
            <div>
              <p class="font-caption text-xs text-text-muted">Routing through</p>
              <p class="mt-0.5 font-medium text-text">{currentProviderName()}</p>
            </div>
            <span class="rounded-md border border-border px-2 py-1 font-caption text-xs text-text-muted">
              {currentModeCopy()}
            </span>
          </div>
        </div>
      </section>

      <Show when={loadError()}>
        <div class="flex flex-col gap-3 rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium text-text">Provider state needs a refresh</p>
            <p class="mt-1 font-caption text-text-secondary">{loadError()}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={bootstrapping()}
            onClick={() => {
              void (async () => {
                await reloadProviderSurface();
              })();
            }}
          >
            {bootstrapping() ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Show>

      <Show when={bootstrapNotice() && !loadError()}>
        <div class="rounded-xl border border-status-warning/35 bg-status-warning/10 p-4">
          <p class="font-medium text-text">Loaded with warnings</p>
          <p class="mt-1 font-caption text-text-secondary">{bootstrapNotice()}</p>
          <Button
            variant="ghost"
            size="sm"
            class="mt-2"
            disabled={bootstrapping()}
            onClick={() => {
              void (async () => {
                await reloadProviderSurface();
              })();
            }}
          >
            {bootstrapping() ? "Retrying..." : "Retry full refresh"}
          </Button>
        </div>
      </Show>

      <Show
        when={!agentProviderStore.loading()}
        fallback={
          <div class="space-y-2">
            <For each={[1, 2, 3, 4]}>
              {() => <div class="h-20 animate-pulse rounded-xl border border-border bg-bg-elevated/40" />}
            </For>
          </div>
        }
      >
        <div class="mb-3 rounded-xl border border-border bg-bg-elevated/30 p-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="relative w-full max-w-md">
            <input
              type="text"
              placeholder="Search providers"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="w-full rounded-md border border-border bg-bg-surface py-2 pl-3 pr-8 font-caption text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
              <Show when={search()}>
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text"
                  onClick={() => setSearch("")}
                  aria-label="Clear provider search"
                >
                  ×
                </button>
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-caption text-text-muted">Sort</span>
              <button
                class={`rounded border px-2 py-1 text-xs transition-colors ${
                  sortPref() === "name" ? "border-primary bg-primary/15 text-text" : "border-border text-text-secondary hover:text-text"
                }`}
                onClick={() => setSortPref("name")}
              >
                Name
              </button>
              <button
                class={`rounded border px-2 py-1 text-xs transition-colors ${
                  sortPref() === "compat" ? "border-primary bg-primary/15 text-text" : "border-border text-text-secondary hover:text-text"
                }`}
                onClick={() => setSortPref("compat")}
              >
                Compatibility
              </button>
            </div>
          </div>
        </div>

        <Show
          when={appProviders().length > 0}
          fallback={
            <div class="rounded-xl border border-border bg-bg-elevated/30 p-10 text-center">
              <h2 class="font-section-header text-text">No providers yet</h2>
              <p class="mt-2 font-body text-text-secondary">Start with a known provider or import what Aether already sees.</p>
              <Button variant="primary" class="mt-4" onClick={handleAdd}>
                Add Provider
              </Button>
            </div>
          }
        >
          <Show when={filteredProviders().length === 0 && search().length > 0}>
            <div class="py-12 text-center">
              <p class="font-body text-text-muted">No providers match "<span class="text-text-secondary">{search()}</span>"</p>
              <button
                class="mt-2 font-caption text-primary hover:underline"
                onClick={() => setSearch("")}
              >
                Clear filter
              </button>
            </div>
          </Show>

          <Show when={filteredProviders().length > 0}>
            <div class="space-y-2">
              <For each={sortedProviders()}>
                {(provider) => (
                  <ProviderItemRow
                    provider={provider}
                    active={isAdditiveMode() ? Boolean(switchMeta()[provider.id]?.inConfig) : currentProviderId() === provider.id}
                    inConfig={Boolean(switchMeta()[provider.id]?.inConfig)}
                    additiveMode={isAdditiveMode()}
                    primaryLabel={primaryActionLabel(provider)}
                    onPrimaryAction={() => handlePrimaryAction(provider)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onFetchModels={handleFetchModels}
                    fetchingModels={fetchingId() === provider.id}
                    rowError={actionErrors()[provider.id]}
                    actionPending={actionPending()[provider.id]}
                    onRetryAction={() => {
                      const err = actionErrors()[provider.id];
                      if (!err) return;
                      if (err.kind === "primary") { void handlePrimaryAction(provider); return; }
                      if (err.kind === "fetch-models") { void handleFetchModels(provider.id); return; }
                      if (err.kind === "delete") { void handleDelete(provider.id); }
                    }}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>

      <ProviderModal
        open={modalOpen()}
        onClose={() => setModalOpen(false)}
        editProvider={editTarget()}
        activeApp={activeApp()}
        onSuccess={() => {
          void (async () => {
            await agentProviderStore.refresh();
            await refreshSwitchState();
          })();
        }}
      />
    </div>
  );
};

export default AgentProviders;
