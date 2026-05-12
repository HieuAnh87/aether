import { createMemo, createSignal, For, Show, Suspense } from "solid-js";
import type { Component } from "solid-js";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Badge, Button, EditPresetForm, Input, useToast } from "../components";
import {
  AGENT_ROLES,
  getProvider,
  isModelValid,
  presetStore,
} from "../stores/presetStore";
import type { AgentConfig, PresetInfo } from "../stores/presetStore";
import { invokeCompat } from "../stores/commandClient";

const NAME_REGEX = /^[A-Za-z0-9_-]+$/;

type PresetStatusVariant = "active" | "warning" | "neutral";

const Presets: Component = () => {
  const { toast } = useToast();
  const [selectedPresetName, setSelectedPresetName] = createSignal<string | null>(null);
  const [inspectorMode, setInspectorMode] = createSignal<"details" | "create" | "edit">("details");
  const [createName, setCreateName] = createSignal("");
  const [creating, setCreating] = createSignal(false);

  const presets = () => presetStore.presets() ?? [];
  const activePreset = createMemo(() => presets().find((preset) => preset.active) ?? null);
  const selectedPreset = createMemo(() => {
    const list = presets();
    if (list.length === 0) return null;
    return (
      list.find((preset) => preset.name === selectedPresetName()) ??
      list.find((preset) => preset.active) ??
      list[0]
    );
  });

  const createNameError = () => {
    const name = createName().trim();
    if (name.length === 0) return undefined;
    if (!NAME_REGEX.test(name)) return "Use letters, numbers, hyphens, or underscores.";
    if (presets().some((preset) => preset.name === name)) return "That preset name already exists.";
    return undefined;
  };

  const canCreate = () => createName().trim().length > 0 && createNameError() === undefined;

  const configuredRoleCount = (preset: PresetInfo) =>
    AGENT_ROLES.filter((role) => (preset.agents[role]?.model ?? "").length > 0).length;

  const invalidRoles = (preset: PresetInfo) =>
    AGENT_ROLES.filter((role) => {
      const model = preset.agents[role]?.model ?? "";
      return model.length > 0 && !isModelValid(model);
    });

  const missingRoleCount = (preset: PresetInfo) => AGENT_ROLES.length - configuredRoleCount(preset);

  const providerNames = (preset: PresetInfo) => {
    const names = new Set<string>();
    for (const role of AGENT_ROLES) {
      const model = preset.agents[role]?.model ?? "";
      if (model) names.add(getProvider(model));
    }
    return Array.from(names);
  };

  const presetHealthLabel = (preset: PresetInfo) => {
    const invalid = invalidRoles(preset).length;
    if (invalid > 0) return `${invalid} role${invalid === 1 ? "" : "s"} need attention`;
    const missing = missingRoleCount(preset);
    if (missing > 0) return `${missing} role${missing === 1 ? "" : "s"} missing`;
    return "Ready";
  };

  const presetStatusVariant = (preset: PresetInfo): PresetStatusVariant =>
    invalidRoles(preset).length > 0 ? "warning" : preset.active ? "active" : "neutral";

  const roleTitle = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

  const compactModel = (model: string) => {
    if (!model) return "Not set";
    const parts = model.split("/");
    return parts[parts.length - 1] || model;
  };

  const selectPreset = (name: string) => {
    setSelectedPresetName(name);
    setInspectorMode("details");
    presetStore.setEditingPreset(null);
  };

  const startCreate = () => {
    setCreateName("");
    setInspectorMode("create");
    presetStore.setEditingPreset(null);
  };

  const startEdit = (name: string) => {
    setSelectedPresetName(name);
    setInspectorMode("edit");
    presetStore.setEditingPreset(name);
  };

  const handleCreate = async () => {
    const name = createName().trim();
    if (!canCreate() || creating()) return;
    setCreating(true);
    try {
      await presetStore.createPreset(name);
      setSelectedPresetName(name);
      setInspectorMode("edit");
      presetStore.setEditingPreset(name);
      setCreateName("");
      toast.success(`Preset "${name}" created`);
    } catch (e) {
      toast.error(`Failed to create preset: ${e}`);
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (name: string) => {
    try {
      await presetStore.activatePreset(name);
      setSelectedPresetName(name);
      toast.success(`Switched to "${name}"`);
    } catch (e) {
      toast.error(`Failed to switch preset: ${e}`);
    }
  };

  const handleDuplicate = async (name: string) => {
    try {
      const newName = await presetStore.duplicatePreset(name);
      setSelectedPresetName(newName);
      setInspectorMode("details");
      toast.success(`Duplicated as "${newName}"`);
    } catch (e) {
      toast.error(`Failed to duplicate: ${e}`);
    }
  };

  const handleDelete = async (name: string) => {
    const ok = window.confirm(
      `Delete preset "${name}"? This removes it from your preset library and cannot be undone.`
    );
    if (!ok) return;
    try {
      await presetStore.deletePreset(name);
      if (selectedPresetName() === name) setSelectedPresetName(null);
      if (presetStore.editingPreset() === name) presetStore.setEditingPreset(null);
      setInspectorMode("details");
      toast.success(`Preset "${name}" deleted`);
    } catch (e) {
      toast.error(`Failed to delete: ${e}`);
    }
  };

  const handleSave = async (name: string, agents: Record<string, AgentConfig>) => {
    try {
      await presetStore.updatePreset(name, agents);
      presetStore.setEditingPreset(null);
      setInspectorMode("details");
      toast.success(`Preset "${name}" updated`);
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    }
  };

  const handleCancelEdit = () => {
    presetStore.setEditingPreset(null);
    setInspectorMode("details");
  };

  const handleExport = async () => {
    try {
      const json = await presetStore.exportPresets();
      const filePath = await save({
        defaultPath: "aether-presets.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
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
      if (!filePath) return;

      const json = await invokeCompat<string>("read_file", { path: filePath });
      await invokeCompat<void>("backup_slim_config");
      const result = await presetStore.importPresets(json);

      const parts: string[] = [];
      if (result.added.length > 0) parts.push(`Added: ${result.added.join(", ")}`);
      if (result.skipped.length > 0) parts.push(`Skipped: ${result.skipped.join(", ")}`);
      if (result.errors.length > 0) parts.push(`Errors: ${result.errors.join(", ")}`);
      if (result.added[0]) setSelectedPresetName(result.added[0]);

      if (result.errors.length > 0) {
        toast.error(parts.join(" | "));
      } else {
        toast.success(parts.join(" | ") || "No presets to import");
      }
    } catch (e) {
      toast.error(`Import failed: ${e}`);
    }
  };

  const LibrarySkeleton = () => (
    <div class="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(420px,1.3fr)]">
      <div class="surface-panel rounded-xl p-3">
        <For each={[0, 1, 2, 3]}>
          {() => <div class="mb-2 h-20 rounded-lg bg-bg-surface" />}
        </For>
      </div>
      <div class="surface-panel rounded-xl p-6">
        <div class="mb-4 h-8 w-1/2 rounded bg-bg-surface" />
        <div class="space-y-3">
          <For each={[0, 1, 2, 3, 4, 5]}>
            {() => <div class="h-12 rounded-lg bg-bg-surface" />}
          </For>
        </div>
      </div>
    </div>
  );

  const EmptyLibrary = () => (
    <section class="surface-panel rounded-xl px-6 py-14 text-center">
      <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-surface text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h2 class="font-section-header text-text">Create your first routing preset</h2>
      <p class="mx-auto mt-2 max-w-[54ch] font-body text-text-secondary">
        Presets bundle the model choices your proxy uses for each agent role. Start with a name, then tune the roles in the inspector.
      </p>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={startCreate}>New preset</Button>
        <Button variant="ghost" onClick={handleImport}>Import JSON</Button>
      </div>
    </section>
  );

  const CreateInspector = () => (
    <section class="surface-panel rounded-xl p-5 md:p-6">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div>
          <p class="font-caption uppercase tracking-[0.12em] text-text-muted">New preset</p>
          <h2 class="mt-1 font-section-header text-text">Name the model set</h2>
          <p class="mt-2 max-w-[56ch] font-body text-text-secondary">
            Use a short, memorable name. After creation, this panel becomes the role editor.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setInspectorMode("details")}>Cancel</Button>
      </div>
      <div class="max-w-md space-y-4">
        <Input
          id="preset-name"
          label="Preset name"
          placeholder="daily-driver"
          value={createName()}
          onInput={setCreateName}
          error={createNameError()}
          disabled={creating()}
        />
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleCreate} disabled={!canCreate() || creating()}>
            {creating() ? "Creating…" : "Create and configure"}
          </Button>
          <p class="font-caption text-text-muted">Letters, numbers, hyphens, and underscores only.</p>
        </div>
      </div>
    </section>
  );

  const PresetInspector = (props: { preset: PresetInfo }) => (
    <section class="surface-panel rounded-xl p-5 md:p-6">
      <div class="mb-5 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={props.preset.active ? "active" : "neutral"}>
              {props.preset.active ? "Active" : "Preset"}
            </Badge>
            <Badge variant={presetStatusVariant(props.preset)}>{presetHealthLabel(props.preset)}</Badge>
          </div>
          <h2 class="truncate font-title text-text">{props.preset.name}</h2>
          <p class="mt-2 max-w-[62ch] font-body text-text-secondary">
            {configuredRoleCount(props.preset)} of {AGENT_ROLES.length} roles configured across {providerNames(props.preset).length || 0} provider{providerNames(props.preset).length === 1 ? "" : "s"}.
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Show when={!props.preset.active}>
            <Button variant="primary" size="sm" onClick={() => handleActivate(props.preset.name)}>
              Activate
            </Button>
          </Show>
          <Button variant="ghost" size="sm" onClick={() => startEdit(props.preset.name)}>
            Edit roles
          </Button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <For each={AGENT_ROLES}>
          {(role) => {
            const model = () => props.preset.agents[role]?.model ?? "";
            const variant = () => props.preset.agents[role]?.variant;
            const invalid = () => model().length > 0 && !isModelValid(model());
            return (
              <div class={`rounded-lg border p-3 ${invalid() ? "border-warning/40 bg-warning-muted" : "border-border bg-bg-surface"}`}>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <span class="font-caption text-text-secondary">{roleTitle(role)}</span>
                  <Show when={invalid()}>
                    <Badge variant="warning">Needs attention</Badge>
                  </Show>
                </div>
                <p class={`truncate font-mono text-sm ${model() ? "text-text" : "text-text-muted"}`} title={model() || "Not set"}>
                  {compactModel(model())}
                </p>
                <Show when={variant()}>
                  <p class="mt-1 font-caption text-text-muted">Thinking: {variant()}</p>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );

  const Inspector = () => (
    <Show when={inspectorMode() !== "create"} fallback={<CreateInspector />}>
      <Show when={selectedPreset()} fallback={<EmptyLibrary />}>
        {(preset) => (
          <Show when={inspectorMode() === "edit"} fallback={<PresetInspector preset={preset()} />}>
            <section class="surface-panel rounded-xl p-5 md:p-6">
              <EditPresetForm
                preset={preset()}
                onSave={(agents) => handleSave(preset().name, agents)}
                onCancel={handleCancelEdit}
              />
            </section>
          </Show>
        )}
      </Show>
    </Show>
  );

  return (
    <div class="space-y-6">
      <header class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="max-w-[70ch]">
          <p class="font-caption uppercase tracking-[0.12em] text-text-muted">Preset library</p>
          <h1 class="mt-1 font-title text-text">Presets</h1>
          <p class="mt-2 font-body text-text-secondary">
            Build, audit, and switch the model sets your proxy routes through.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleImport}>Import</Button>
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={presets().length === 0}>Export</Button>
          <Button variant="primary" size="sm" onClick={startCreate}>New preset</Button>
        </div>
      </header>

      <Show when={activePreset()}>
        {(preset) => (
          <button
            type="button"
            class="focus-ring w-full rounded-xl border border-primary/25 bg-primary-muted p-4 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-primary-muted/80"
            onClick={() => selectPreset(preset().name)}
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div class="min-w-0">
                <div class="mb-1 flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                  <span class="font-caption uppercase tracking-[0.1em] text-primary">Currently routing</span>
                </div>
                <p class="truncate font-section-header text-text">{preset().name}</p>
              </div>
              <div class="font-caption text-text-secondary">
                {configuredRoleCount(preset())}/{AGENT_ROLES.length} roles set · {presetHealthLabel(preset())}
              </div>
            </div>
          </button>
        )}
      </Show>

      <Suspense fallback={<LibrarySkeleton />}>
        <Show when={presets().length > 0} fallback={<EmptyLibrary />}>
          <div class="grid gap-5 lg:grid-cols-[minmax(280px,0.88fr)_minmax(430px,1.35fr)]">
            <aside class="surface-panel rounded-xl p-2 md:p-3">
              <div class="flex items-center justify-between px-2 pb-2 pt-1">
                <div>
                  <h2 class="font-section-header text-text">Library</h2>
                  <p class="font-caption text-text-muted">{presets().length} preset{presets().length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <div class="max-h-[620px] space-y-2 overflow-auto pr-1">
                <For each={presets()}>
                  {(preset) => {
                    const selected = () => selectedPreset()?.name === preset.name && inspectorMode() !== "create";
                    const providers = () => providerNames(preset);
                    return (
                      <article class={`group rounded-lg border transition-colors duration-150 ${selected() ? "border-primary/50 bg-primary-muted" : "border-border bg-bg-elevated hover:border-border-hover hover:bg-bg-surface"}`}>
                        <button type="button" class="focus-ring w-full rounded-lg p-3 text-left" onClick={() => selectPreset(preset.name)}>
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="mb-2 flex min-w-0 items-center gap-2">
                                <span class="truncate font-section-header text-text">{preset.name}</span>
                                <Show when={preset.active}>
                                  <Badge variant="active">Active</Badge>
                                </Show>
                              </div>
                              <p class="font-caption text-text-secondary">
                                {configuredRoleCount(preset)}/{AGENT_ROLES.length} roles · {presetHealthLabel(preset)}
                              </p>
                              <div class="mt-3 flex flex-wrap gap-1.5">
                                <For each={providers().slice(0, 3)}>
                                  {(provider) => <Badge variant="neutral">{provider}</Badge>}
                                </For>
                                <Show when={providers().length === 0}>
                                  <Badge variant="warning">No models</Badge>
                                </Show>
                              </div>
                            </div>
                          </div>
                        </button>
                        <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                          <Show when={!preset.active} fallback={<span class="font-caption text-text-muted">Ready to route</span>}>
                            <button type="button" class="focus-ring rounded-md px-2 py-1 font-caption text-primary transition-colors hover:bg-primary-muted" onClick={() => handleActivate(preset.name)}>
                              Activate
                            </button>
                          </Show>
                          <details class="ml-auto">
                            <summary class="focus-ring list-none rounded-md px-2 py-1 font-caption text-text-secondary transition-colors hover:bg-bg-surface hover:text-text [&::-webkit-details-marker]:hidden">
                              More
                            </summary>
                            <div class="mt-2 w-36 rounded-lg border border-border bg-bg-elevated p-1">
                              <button type="button" class="w-full rounded-md px-2 py-1.5 text-left font-caption text-text-secondary hover:bg-bg-surface hover:text-text" onClick={() => startEdit(preset.name)}>Edit</button>
                              <button type="button" class="w-full rounded-md px-2 py-1.5 text-left font-caption text-text-secondary hover:bg-bg-surface hover:text-text" onClick={() => handleDuplicate(preset.name)}>Duplicate</button>
                              <button type="button" class="w-full rounded-md px-2 py-1.5 text-left font-caption text-error hover:bg-error-muted" onClick={() => handleDelete(preset.name)}>Delete</button>
                            </div>
                          </details>
                        </div>
                      </article>
                    );
                  }}
                </For>
              </div>
            </aside>
            <Inspector />
          </div>
        </Show>
      </Suspense>
    </div>
  );
};

export default Presets;
