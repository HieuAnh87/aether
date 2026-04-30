import { createSignal, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types (mirrors Rust backend)
// ---------------------------------------------------------------------------

export interface AgentConfig {
  model: string;
  variant?: string;
  skills: string[];
  mcps: string[];
  [key: string]: unknown;
}

export interface PresetInfo {
  name: string;
  active: boolean;
  agents: Record<string, AgentConfig>;
}

// The 6 agent roles used in presets
export const AGENT_ROLES = [
  "orchestrator",
  "oracle",
  "librarian",
  "explorer",
  "designer",
  "fixer",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

// ---------------------------------------------------------------------------
// Store signals
// ---------------------------------------------------------------------------

const [presetsVersion, setPresetsVersion] = createSignal(0);

// Presets resource — refetches when version increments
const [presets] = createResource(presetsVersion, async () => {
  try {
    return await invoke<PresetInfo[]>("get_presets");
  } catch (e) {
    console.error("[presetStore] Failed to load presets:", e);
    return [];
  }
});

// Available models from opencode.json
const [availableModels] = createResource(async () => {
  try {
    return await invoke<string[]>("get_available_models");
  } catch (e) {
    console.error("[presetStore] Failed to load available models:", e);
    return [];
  }
});

const [modelVariants] = createResource(async () => {
  try {
    return await invoke<Record<string, string[]>>("get_model_variants");
  } catch (e) {
    console.error("[presetStore] Failed to load model variants:", e);
    return {};
  }
});

// Loading state for individual operations
const [operationLoading, setOperationLoading] = createSignal(false);

// Currently editing preset name (null = not editing)
const [editingPreset, setEditingPreset] = createSignal<string | null>(null);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Trigger a refetch of presets from backend */
function refresh() {
  setPresetsVersion((v) => v + 1);
}

/** Switch the active preset */
async function activatePreset(name: string): Promise<void> {
  setOperationLoading(true);
  try {
    await invoke("set_active_preset", { name });
    refresh();
  } finally {
    setOperationLoading(false);
  }
}

/** Create a new preset with the given name */
async function createPreset(name: string): Promise<void> {
  setOperationLoading(true);
  try {
    await invoke("create_preset", { name });
    refresh();
  } finally {
    setOperationLoading(false);
  }
}

/** Update all agent configs for a preset */
async function updatePreset(
  name: string,
  agents: Record<string, AgentConfig>
): Promise<void> {
  setOperationLoading(true);
  try {
    await invoke("update_preset", { name, agents });
    refresh();
  } finally {
    setOperationLoading(false);
  }
}

/** Delete a preset */
async function deletePreset(name: string): Promise<void> {
  setOperationLoading(true);
  try {
    await invoke("delete_preset", { name });
    // If we were editing the deleted preset, clear editing state
    if (editingPreset() === name) {
      setEditingPreset(null);
    }
    refresh();
  } finally {
    setOperationLoading(false);
  }
}

/** Duplicate a preset, returns the new name */
async function duplicatePreset(name: string): Promise<string> {
  setOperationLoading(true);
  try {
    const newName = await invoke<string>("duplicate_preset", { name });
    refresh();
    return newName;
  } finally {
    setOperationLoading(false);
  }
}

/** Export all presets as JSON string */
async function exportPresets(): Promise<string> {
  const all = presets();
  if (!all) return "{}";
  const data: Record<string, Record<string, AgentConfig>> = {};
  for (const p of all) {
    data[p.name] = p.agents;
  }
  return JSON.stringify({ presets: data }, null, 2);
}

/** Import presets from JSON string. Returns { added, skipped, errors } */
async function importPresets(
  json: string
): Promise<{ added: string[]; skipped: string[]; errors: string[] }> {
  const result = { added: [] as string[], skipped: [] as string[], errors: [] as string[] };

  let parsed: { presets?: Record<string, Record<string, AgentConfig>> };
  try {
    parsed = JSON.parse(json);
  } catch {
    result.errors.push("Invalid JSON");
    return result;
  }

  if (!parsed.presets || typeof parsed.presets !== "object") {
    result.errors.push('Missing "presets" key in import file');
    return result;
  }

  const nameRegex = /^[A-Za-z0-9_-]+$/;
  const existingNames = new Set((presets() ?? []).map((p) => p.name));

  for (const [name, agents] of Object.entries(parsed.presets)) {
    if (!nameRegex.test(name)) {
      result.skipped.push(`${name} (invalid name)`);
      continue;
    }

    try {
      if (existingNames.has(name)) {
        // Update existing
        await invoke("update_preset", { name, agents });
        result.added.push(`${name} (updated)`);
      } else {
        // Create then update with agents
        await invoke("create_preset", { name });
        await invoke("update_preset", { name, agents });
        result.added.push(name);
      }
    } catch (e) {
      result.errors.push(`${name}: ${e}`);
    }
  }

  refresh();
  return result;
}

// ---------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------

/** Split a model ID on first slash: "provider/model" → ["provider", "model"] */
export function splitModelId(modelId: string): [string, string] {
  const idx = modelId.indexOf("/");
  if (idx === -1) return [modelId, ""];
  return [modelId.slice(0, idx), modelId.slice(idx + 1)];
}

/** Check if a model ID is in the available models list */
export function isModelValid(modelId: string): boolean {
  const models = availableModels();
  if (!models || models.length === 0) return true; // can't validate, assume ok
  return models.includes(modelId);
}

/** Get provider name from a model ID */
export function getProvider(modelId: string): string {
  return splitModelId(modelId)[0];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const presetStore = {
  // Reactive data
  presets,
  availableModels,
  modelVariants,
  operationLoading,
  editingPreset,
  setEditingPreset,

  // Actions
  refresh,
  activatePreset,
  createPreset,
  updatePreset,
  deletePreset,
  duplicatePreset,
  exportPresets,
  importPresets,
};
