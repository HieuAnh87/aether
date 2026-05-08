import { createSignal, Show, For, Suspense } from "solid-js";
import type { Component } from "solid-js";
import { save, open } from "@tauri-apps/plugin-dialog";
import {
  Button,
  PresetCard,
  PresetGrid,
  PresetEmptyState,
  CreatePresetModal,
  EditPresetForm,
  useToast,
} from "../components";
import {
  presetStore,
} from "../stores/presetStore";
import type { AgentConfig } from "../stores/presetStore";
import { invokeCompat } from "../stores/commandClient";

const Presets: Component = () => {
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = createSignal(false);

  // -----------------------------------------------------------------------
  // Actions with toast feedback
  // -----------------------------------------------------------------------

  const handleCreate = async (name: string) => {
    try {
      await presetStore.createPreset(name);
      setShowCreateModal(false);
      toast.success(`Preset "${name}" created`);
    } catch (e) {
      toast.error(`Failed to create preset: ${e}`);
    }
  };

  const handleActivate = async (name: string) => {
    try {
      await presetStore.activatePreset(name);
      toast.success(`Switched to "${name}"`);
    } catch (e) {
      toast.error(`Failed to switch preset: ${e}`);
    }
  };

  const handleDuplicate = async (name: string) => {
    try {
      const newName = await presetStore.duplicatePreset(name);
      toast.success(`Duplicated as "${newName}"`);
    } catch (e) {
      toast.error(`Failed to duplicate: ${e}`);
    }
  };

  const handleDelete = async (name: string) => {
    // Simple confirm via window.confirm (tauri-plugin-dialog has ask() but
    // window.confirm works fine for now)
    const ok = window.confirm(
      `Delete preset "${name}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await presetStore.deletePreset(name);
      toast.success(`Preset "${name}" deleted`);
    } catch (e) {
      toast.error(`Failed to delete: ${e}`);
    }
  };

  const handleEdit = (name: string) => {
    presetStore.setEditingPreset(name);
  };

  const handleSave = async (
    name: string,
    agents: Record<string, AgentConfig>
  ) => {
    try {
      await presetStore.updatePreset(name, agents);
      presetStore.setEditingPreset(null);
      toast.success(`Preset "${name}" updated`);
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    }
  };

  const handleCancelEdit = () => {
    presetStore.setEditingPreset(null);
  };

  // -----------------------------------------------------------------------
  // Import / Export
  // -----------------------------------------------------------------------

  const handleExport = async () => {
    try {
      const json = await presetStore.exportPresets();
      const filePath = await save({
        defaultPath: "aether-presets.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return; // user cancelled
      await invokeCompat<void>("write_file", { path: filePath, content: json });
      toast.success("Presets exported successfully");
    } catch (e) {
      toast.error(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return; // user cancelled

      const json = await invokeCompat<string>("read_file", {
        path: filePath,
      });

      // Backup current config before import
      await invokeCompat<void>("backup_slim_config");

      const result = await presetStore.importPresets(json);

      const parts: string[] = [];
      if (result.added.length > 0)
        parts.push(`Added: ${result.added.join(", ")}`);
      if (result.skipped.length > 0)
        parts.push(`Skipped: ${result.skipped.join(", ")}`);
      if (result.errors.length > 0)
        parts.push(`Errors: ${result.errors.join(", ")}`);

      if (result.errors.length > 0) {
        toast.error(parts.join(" | "));
      } else {
        toast.success(parts.join(" | ") || "No presets to import");
      }
    } catch (e) {
      toast.error(`Import failed: ${e}`);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const editingPresetData = () => {
    const name = presetStore.editingPreset();
    if (!name) return null;
    return (presetStore.presets() ?? []).find((p) => p.name === name) ?? null;
  };

  return (
    <div>
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="font-title text-text">Presets</h1>
          <p class="mt-1 font-body text-text-secondary">
            Manage your model presets
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleImport}>
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
            Export
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            + New Preset
          </Button>
        </div>
      </div>

      {/* Edit form (shown above grid when editing) */}
      <Show when={editingPresetData()}>
        {(preset) => (
          <div class="mb-6">
            <EditPresetForm
              preset={preset()}
              onSave={(agents) => handleSave(preset().name, agents)}
              onCancel={handleCancelEdit}
            />
          </div>
        )}
      </Show>

      {/* Preset grid or empty state */}
      <Suspense
        fallback={
          <p class="font-body text-text-muted py-10 text-center">
            Loading presets…
          </p>
        }
      >
        <Show
          when={(presetStore.presets() ?? []).length > 0}
          fallback={<PresetEmptyState />}
        >
          <PresetGrid>
            <For each={presetStore.presets()}>
              {(preset) => (
                <PresetCard
                  preset={preset}
                  onActivate={() => handleActivate(preset.name)}
                  onEdit={() => handleEdit(preset.name)}
                  onDuplicate={() => handleDuplicate(preset.name)}
                  onDelete={() => handleDelete(preset.name)}
                />
              )}
            </For>
          </PresetGrid>
        </Show>
      </Suspense>

      {/* Create modal */}
      <CreatePresetModal
        open={showCreateModal()}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </div>
  );
};

export default Presets;
