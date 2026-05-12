import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Badge, Button } from "../components";
import {
  presetStore,
  AGENT_ROLES,
  getProvider,
} from "../stores/presetStore";
import type { PresetInfo, AgentConfig } from "../stores/presetStore";

interface EditPresetFormProps {
  preset: PresetInfo;
  onSave: (agents: Record<string, AgentConfig>) => Promise<void>;
  onCancel: () => void;
}

/** Returns a hex color for a given provider name */
function providerColor(provider: string): string {
  if (provider === "anthropic" || provider === "troll") return "#A855F7";
  if (provider === "openai") return "#10B981";
  if (provider === "google") return "#3B82F6";
  if (provider === "vertexai") return "#6759F4";
  return "#6B7280";
}

const EditPresetForm = (props: EditPresetFormProps) => {
  // Build local state: one signal per role holding model + variant
  type LocalAgents = Record<string, { model: string; variant: string }>;

  const initialModels = (): LocalAgents => {
    const result: LocalAgents = {};
    for (const role of AGENT_ROLES) {
      result[role] = {
        model: props.preset.agents[role]?.model ?? "",
        variant: props.preset.agents[role]?.variant ?? "",
      };
    }
    return result;
  };

  const [localModels, setLocalModels] = createSignal<LocalAgents>(initialModels());
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    const presetName = props.preset.name;
    void presetName;
    setLocalModels(initialModels());
  });

  const handleSelect = (role: string, value: string) => {
    setLocalModels((prev) => ({
      ...prev,
      [role]: { ...prev[role], model: value },
    }));
  };

  const handleVariantChange = (role: string, variant: string) => {
    setLocalModels((prev) => ({
      ...prev,
      [role]: { ...prev[role], variant },
    }));
  };

  const hasUnsavedChanges = createMemo(() => {
    const current = localModels();
    const initial = initialModels();
    return AGENT_ROLES.some(
      (role) => current[role]?.model !== initial[role]?.model || current[role]?.variant !== initial[role]?.variant
    );
  });

  const handleCancel = () => {
    if (hasUnsavedChanges()) {
      const ok = window.confirm("Discard unsaved role changes?");
      if (!ok) return;
    }
    props.onCancel();
  };

  const handleSave = async () => {
    if (saving()) return;
    setSaving(true);
    try {
      const agents: Record<string, AgentConfig> = {};
      const models = localModels();
      for (const role of AGENT_ROLES) {
        const existing = props.preset.agents[role];
        const { model, variant } = models[role];
        if (existing) {
          agents[role] = { ...existing, model, variant: variant || undefined };
        } else {
          agents[role] = {
            model,
            variant: variant || undefined,
            skills: [],
            mcps: [],
          };
        }
      }
      await props.onSave(agents);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="font-caption uppercase tracking-[0.12em] text-text-muted">Role editor</p>
          <h2 class="mt-1 font-section-header text-text">Editing {props.preset.name}</h2>
          <p class="mt-1 max-w-[58ch] font-body text-text-secondary">
            Choose the model each agent role should use when this preset is active.
          </p>
        </div>
        <Show when={hasUnsavedChanges()}>
          <Badge variant="warning">Unsaved</Badge>
        </Show>
      </div>

      {/* Agent rows */}
      <div class="grid gap-3">
        <For each={AGENT_ROLES}>
          {(role) => {
            const currentModel = () => localModels()[role]?.model ?? "";
            const availModels = () => presetStore.availableModels() ?? [];
            const isUnknown = () =>
              currentModel() !== "" && !availModels().includes(currentModel());
            const provider = () => getProvider(currentModel());
            const dotColor = () =>
              currentModel() ? providerColor(provider()) : "#6B7280";
            const modelVariants = () => {
              const variants = presetStore.modelVariants();
              return variants?.[currentModel()] ?? [];
            };
            const hasVariants = () => modelVariants().length > 0;
            const currentVariant = () => localModels()[role]?.variant ?? "";

            return (
              <div class="rounded-lg border border-border bg-bg-surface p-3">
                {/* Role label */}
                <div class="mb-2 flex items-center justify-between gap-2">
                  <label class="font-caption text-text-secondary capitalize">
                    {role}
                  </label>
                  <Show when={isUnknown()}>
                    <Badge variant="warning">Unknown model</Badge>
                  </Show>
                </div>

                {/* Select row */}
                <div class="flex items-center gap-2">
                  {/* Provider dot */}
                  <span
                    class="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ "background-color": dotColor() }}
                  />

                  <select
                    value={currentModel()}
                    onChange={(e) => handleSelect(role, e.currentTarget.value)}
                    class="h-9 w-full rounded-md border border-border bg-bg-elevated px-3 font-body text-sm text-text outline-none transition-colors duration-150 focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select model…</option>
                    <For each={availModels()}>
                      {(model) => (
                        <option value={model}>{model}</option>
                      )}
                    </For>
                  </select>
                </div>

                {/* Variant selector — only if model has variants */}
                <Show when={hasVariants()}>
                  <div class="ml-4 mt-2 flex items-center gap-1.5">
                    <span class="font-caption text-xs text-text-muted">Thinking:</span>
                    <div class="inline-flex overflow-hidden rounded-md border border-border">
                      <For each={modelVariants()}>
                        {(v) => (
                          <button
                            type="button"
                            class={`px-2.5 py-0.5 text-xs font-medium transition-colors ${
                              currentVariant() === v
                                ? "bg-primary text-primary-foreground"
                                : "bg-bg-elevated text-text-secondary hover:bg-bg-surface-hover"
                            }`}
                            onClick={() => handleVariantChange(role, v)}
                          >
                            {v === "low" ? "Low" : v === "medium" ? "Med" : v === "high" ? "High" : v}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Footer */}
      <div class="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-bg-surface/95 px-5 pt-4 md:-mx-6 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={saving()}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving()}
          loading={saving()}
          loadingLabel="Saving..."
        >
          Save
        </Button>
      </div>
    </div>
  );
};

export default EditPresetForm;
