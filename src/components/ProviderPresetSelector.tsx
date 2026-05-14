import { For, Show } from "solid-js";
import type { ProviderPreset, ProviderPresetApp } from "../config/providerPresets";
import { presetCategoryLabels } from "../config/providerPresets";

interface ProviderPresetSelectorProps {
  app: ProviderPresetApp;
  presets: ProviderPreset[];
  selectedPresetId: string | null;
  onSelectPreset: (id: string) => void;
}

const ProviderPresetSelector = (props: ProviderPresetSelectorProps) => {
  const appPresets = () => props.presets.filter((p) => p.app === props.app);

  const grouped = () => {
    const map = new Map<string, ProviderPreset[]>();
    for (const preset of appPresets()) {
      const bucket = map.get(preset.category) ?? [];
      bucket.push(preset);
      map.set(preset.category, bucket);
    }
    return Array.from(map.entries());
  };

  const chipClass = (selected: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
      selected
        ? "border-primary bg-primary/15 text-text"
        : "border-border-strong text-text-secondary hover:border-primary hover:text-text"
    }`;

  return (
    <div class="space-y-2.5">
      <p class="font-caption text-xs text-text-muted">Quick start</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          class={chipClass(props.selectedPresetId === "custom")}
          onClick={() => props.onSelectPreset("custom")}
        >
          Custom
        </button>
        <Show when={appPresets().length > 0}>
          <For each={grouped()}>
            {([category, presets]) => (
              <>
                <span class="self-center text-border select-none" aria-hidden="true">·</span>
                <span class="self-center font-caption text-xs text-text-muted">
                  {presetCategoryLabels[category as keyof typeof presetCategoryLabels] ?? category}
                </span>
                <For each={presets}>
                  {(preset) => (
                    <button
                      type="button"
                      class={chipClass(props.selectedPresetId === preset.id)}
                      onClick={() => props.onSelectPreset(preset.id)}
                    >
                      {preset.name}
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default ProviderPresetSelector;
