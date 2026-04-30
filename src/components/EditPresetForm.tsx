import { createSignal, For, Show } from "solid-js";
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
    <div class="flex flex-col gap-4">
      {/* Header */}
      <h2 class="font-section-header text-text">
        Editing: {props.preset.name}
      </h2>

      {/* Agent rows */}
      <div class="flex flex-col gap-3">
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
              <div class="flex flex-col gap-1">
                {/* Role label */}
                <label class="font-caption text-text-secondary capitalize">
                  {role}
                </label>

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
                    class="bg-glass-bg border border-border rounded-md h-9 px-3 text-sm text-text font-body w-full focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors duration-150"
                  >
                    <option value="">Select model…</option>
                    <For each={availModels()}>
                      {(model) => (
                        <option value={model}>{model}</option>
                      )}
                    </For>
                  </select>

                  {/* Unknown model badge */}
                  <Show when={isUnknown()}>
                    <Badge variant="warning">Unknown model</Badge>
                  </Show>
                </div>

                {/* Variant selector — only if model has variants */}
                <Show when={hasVariants()}>
                  <div class="flex items-center gap-1.5 mt-1.5 ml-4">
                    <span class="font-caption text-text-muted text-xs">Thinking:</span>
                    <div class="inline-flex rounded-md border border-border overflow-hidden">
                      <For each={modelVariants()}>
                        {(v) => (
                          <button
                            type="button"
                            class={`px-2.5 py-0.5 text-xs font-medium transition-colors ${
                              currentVariant() === v
                                ? "bg-primary text-white"
                                : "bg-glass-bg text-text-secondary hover:bg-border/50"
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
      <div class="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onCancel}
          disabled={saving()}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving()}
        >
          {saving() ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
};

export default EditPresetForm;
