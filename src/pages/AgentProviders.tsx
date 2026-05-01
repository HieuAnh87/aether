import type { Component } from "solid-js";
import { createSignal, createEffect, For, Show, onMount } from "solid-js";
import { agentProviderStore, type AgentProviderInfo, type WellKnownProvider } from "../stores/agentProviderStore";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Input from "../components/Input";
import Badge from "../components/Badge";
import GlassCard from "../components/GlassCard";
import { useToast } from "../components/Toast";

// ---------------------------------------------------------------------------
// Add / Edit Provider Modal
// ---------------------------------------------------------------------------

interface ProviderModalProps {
  open: boolean;
  onClose: () => void;
  editProvider?: AgentProviderInfo;
  onSuccess: () => void;
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
        setApiKey(""); // never pre-fill keys
        setValidated(null);
        setError("");
      } else {
        setId("");
        setName("");
        setBaseUrl("");
        setCompatibility("openai");
        setModelsEndpoint(true);
        setApiKey("");
        setValidated(null);
        setError("");
      }
    }
  });

  const isEditing = () => !!props.editProvider;

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
    setSaving(true);
    setError("");
    try {
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

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={isEditing() ? `Edit ${props.editProvider?.name}` : "Add Provider"}
      size="lg"
    >
      <div class="space-y-5">
        {/* Well-known presets (only in add mode) */}
        <Show when={!isEditing() && agentProviderStore.wellKnown().length > 0}>
          <div>
            <label class="mb-2 block font-caption text-text-secondary">Quick-add a known provider</label>
            <div class="flex flex-wrap gap-2">
              <For each={agentProviderStore.wellKnown()}>
                {(preset) => (
                  <button
                    class="rounded-md border border-border px-2.5 py-1 font-caption text-text-secondary transition-colors hover:border-primary hover:text-text"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                )}
              </For>
            </div>
          </div>
          <hr class="border-border" />
        </Show>

        {/* ID (add only) */}
        <Show when={!isEditing()}>
          <Input
            label="Provider ID (slug)"
            value={id()}
            onInput={(v: string) => setId(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="groq"
          />
        </Show>

        <Input
          label="Display Name"
          value={name()}
          onInput={setName}
          placeholder="Groq"
        />

        <Input
          label="Base URL"
          value={baseUrl()}
          onInput={(v: string) => {
            setBaseUrl(v);
            setValidated(null);
          }}
          placeholder="https://api.groq.com/openai/v1"
        />

        {/* Compatibility */}
        <div>
          <label class="mb-1 block font-caption text-text-secondary">API Compatibility</label>
          <div class="flex gap-2">
            <For each={["openai", "anthropic"] as const}>
              {(compat) => (
                <button
                  class={`rounded-lg border px-3 py-2 font-caption transition-colors ${
                    compatibility() === compat
                      ? "border-primary bg-glass-bg text-text"
                      : "border-border text-text-secondary hover:border-text-muted"
                  }`}
                  onClick={() => setCompatibility(compat)}
                >
                  {compat === "openai" ? "OpenAI-compatible" : "Anthropic-compatible"}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Model listing toggle */}
        <div class="flex items-center gap-3">
          <button
            role="switch"
            aria-checked={modelsEndpoint()}
            onClick={() => setModelsEndpoint((v) => !v)}
            class={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              modelsEndpoint() ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              class={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                modelsEndpoint() ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
          <span class="font-caption text-text-secondary">
            Fetch model list from <code class="font-mono text-text-muted">/models</code>
          </span>
        </div>

        {/* API Key */}
        <div>
          <Input
            label={isEditing() ? "New API Key (leave blank to keep existing)" : "API Key"}
            type="password"
            value={apiKey()}
            onInput={(v: string) => {
              setApiKey(v);
              setValidated(null);
            }}
            placeholder={isEditing() ? "Enter new key to replace..." : "sk-..."}
          />
        </div>

        {/* Validation status */}
        <Show when={validated() !== null}>
          <div class="flex items-center gap-2">
            <Show when={validated() === true}>
              <Badge variant="active">✓ Key verified</Badge>
            </Show>
            <Show when={validated() === false}>
              <Badge variant="warning">Verification failed — you can still save</Badge>
            </Show>
          </div>
        </Show>

        <Show when={error()}>
          <p class="font-caption text-status-error">{error()}</p>
        </Show>

        {/* Actions */}
        <div class="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={handleValidate}
            disabled={!baseUrl().trim() || !apiKey().trim() || validating()}
          >
            {validating() ? "Validating..." : "Validate Key"}
          </Button>
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
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Provider card
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  provider: AgentProviderInfo;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onFetchModels: (id: string) => void;
  fetchingModels: boolean;
}

const ProviderItemCard: Component<ProviderCardProps> = (props) => {
  return (
    <GlassCard>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium text-text">{props.provider.name}</span>
            <Badge variant={props.provider.compatibility === "openai" ? "openai" : "anthropic"}>
              {props.provider.compatibility}
            </Badge>
          </div>
          <p class="mt-0.5 truncate font-caption text-text-muted">{props.provider.baseUrl}</p>
        </div>
        <div class="flex shrink-0 gap-1">
          <button
            class="rounded-md px-2 py-1 font-caption text-text-secondary transition-colors hover:bg-glass-bg hover:text-text"
            onClick={() => props.onEdit(props.provider.id)}
          >
            Edit
          </button>
          <button
            class="rounded-md px-2 py-1 font-caption text-status-error transition-colors hover:bg-glass-bg"
            onClick={() => props.onDelete(props.provider.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Key status */}
      <div class="mt-3 flex items-center gap-2">
        <Show
          when={props.provider.hasKey}
          fallback={<Badge variant="warning">No API key</Badge>}
        >
          <Badge variant="active">Key stored</Badge>
          <Show when={props.provider.maskedKey}>
            <span class="font-mono text-xs text-text-muted">{props.provider.maskedKey}</span>
          </Show>
        </Show>
      </div>

      {/* Models */}
      <div class="mt-3 flex items-center gap-2">
        <Show when={props.provider.modelsEndpoint}>
          <button
            class="flex items-center gap-1 rounded-md border border-border px-2 py-1 font-caption text-text-secondary transition-colors hover:border-primary hover:text-text disabled:opacity-50"
            onClick={() => props.onFetchModels(props.provider.id)}
            disabled={props.fetchingModels || !props.provider.hasKey}
          >
            <Show when={props.fetchingModels} fallback={
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h5M16 16v-5h-5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M4 9a7 7 0 0114 0M16 11a7 7 0 01-14 0" stroke-linecap="round" />
              </svg>
            }>
              <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-linecap="round" />
              </svg>
            </Show>
            {props.fetchingModels ? "Fetching..." : "Fetch Models"}
          </button>
        </Show>
        <Show when={props.provider.models.length > 0}>
          <span class="font-caption text-text-muted">
            {props.provider.models.length} model{props.provider.models.length !== 1 ? "s" : ""}
          </span>
        </Show>
      </div>

      {/* Model chips (collapsed after 5) */}
      <Show when={props.provider.models.length > 0}>
        <div class="mt-2 flex flex-wrap gap-1">
          <For each={props.provider.models.slice(0, 5)}>
            {(model) => (
              <span class="rounded bg-glass-bg px-1.5 py-0.5 font-mono text-xs text-text-muted">
                {model}
              </span>
            )}
          </For>
          <Show when={props.provider.models.length > 5}>
            <span class="rounded bg-glass-bg px-1.5 py-0.5 font-mono text-xs text-text-muted">
              +{props.provider.models.length - 5} more
            </span>
          </Show>
        </div>
      </Show>
    </GlassCard>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const AgentProviders: Component = () => {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<AgentProviderInfo | undefined>(undefined);
  const [fetchingId, setFetchingId] = createSignal<string | null>(null);

  onMount(async () => {
    await Promise.all([
      agentProviderStore.refresh(),
      agentProviderStore.loadWellKnown(),
    ]);
  });

  const handleAdd = () => {
    setEditTarget(undefined);
    setModalOpen(true);
  };

  const handleEdit = (id: string) => {
    const p = agentProviderStore.providers().find((x) => x.id === id);
    if (p) {
      setEditTarget(p);
      setModalOpen(true);
    }
  };

  const handleDelete = async (id: string) => {
    const p = agentProviderStore.providers().find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`Delete provider "${p.name}"? This will also remove the API key from Keychain.`)) return;
    try {
      await agentProviderStore.deleteProvider(id);
      toast.success(`${p.name} removed`);
    } catch (e: unknown) {
      toast.error(`Failed to delete: ${String(e)}`);
    }
  };

  const handleFetchModels = async (id: string) => {
    setFetchingId(id);
    try {
      const models = await agentProviderStore.fetchModels(id);
      toast.success(`Fetched ${models.length} models`);
    } catch (e: unknown) {
      toast.error(`Failed to fetch models: ${String(e)}`);
    } finally {
      setFetchingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Agent Providers</h1>
          <p class="mt-1 font-body text-text-secondary">
            Add OpenAI-compatible or Anthropic-compatible providers for your CLI agents.
            API keys are stored securely in macOS Keychain.
          </p>
        </div>
        <Button variant="primary" onClick={handleAdd}>
          Add Provider
        </Button>
      </div>

      {/* Provider list */}
      <Show
        when={!agentProviderStore.loading()}
        fallback={<p class="font-body text-text-muted">Loading providers...</p>}
      >
        <Show
          when={agentProviderStore.providers().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-20">
              <svg class="mb-4 h-16 w-16 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <h2 class="font-section-header text-text-secondary">No providers yet</h2>
              <p class="mt-2 font-body text-text-muted">
                Add a provider like Groq, OpenRouter, or Mistral to get started.
              </p>
              <Button variant="primary" class="mt-4" onClick={handleAdd}>
                Add Provider
              </Button>
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <For each={agentProviderStore.providers()}>
              {(provider) => (
                <ProviderItemCard
                  provider={provider}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onFetchModels={handleFetchModels}
                  fetchingModels={fetchingId() === provider.id}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      <ProviderModal
        open={modalOpen()}
        onClose={() => setModalOpen(false)}
        editProvider={editTarget()}
        onSuccess={agentProviderStore.refresh}
      />
    </div>
  );
};

export default AgentProviders;
