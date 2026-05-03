import { For, Show } from "solid-js";
import { GlassCard, Badge, Button } from "../components";
import { AGENT_ROLES, isModelValid, getProvider } from "../stores/presetStore";
import type { PresetInfo } from "../stores/presetStore";

interface PresetCardProps {
  preset: PresetInfo;
  onActivate: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function providerColor(modelId: string): string {
  const provider = getProvider(modelId).toLowerCase();
  if (provider === "anthropic" || provider === "troll") return "#A855F7";
  if (provider === "openai") return "#10B981";
  if (provider === "google") return "#3B82F6";
  if (provider === "vertexai") return "#6759F4";
  return "#6B7280";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PresetCard = (props: PresetCardProps) => {
  return (
    <GlassCard active={props.preset.active}>
      {/* Header row */}
      <div class="mb-4 flex items-center gap-2">
        <span class="font-section-header text-text flex-1">{props.preset.name}</span>
        <Show when={props.preset.active}>
          <Badge variant="active">ACTIVE</Badge>
        </Show>
      </div>

      {/* Agent list */}
      <div class="mb-5 space-y-2">
        <For each={AGENT_ROLES}>
          {(role) => {
            const agent = () => props.preset.agents[role];
            const modelId = () => agent()?.model ?? "";
            const hasModel = () => modelId().length > 0;

            return (
              <div class="flex items-center justify-between gap-2">
                <span class="font-caption text-text-secondary w-24 shrink-0">
                  {capitalize(role)}
                </span>
                <Show
                  when={hasModel()}
                  fallback={
                    <span class="font-body text-text-muted flex-1">Not set</span>
                  }
                >
                  <div class="flex min-w-0 flex-1 items-center gap-1.5">
                    {/* Provider color dot */}
                    <span
                      class="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ "background-color": providerColor(modelId()) }}
                    />
                    <span class="font-body text-text min-w-0 flex-1 truncate">
                      {modelId()}
                    </span>
                    <Show when={!isModelValid(modelId())}>
                      <Badge variant="warning">⚠</Badge>
                    </Show>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Action buttons */}
      <div class="flex flex-wrap items-center gap-2">
        <Show when={!props.preset.active}>
          <Button variant="primary" size="sm" onClick={props.onActivate}>
            Activate
          </Button>
        </Show>
        <Button variant="ghost" size="sm" onClick={props.onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={props.onDuplicate}>
          Duplicate
        </Button>
        <Button variant="danger" size="sm" onClick={props.onDelete}>
          Delete
        </Button>
      </div>
    </GlassCard>
  );
};

export default PresetCard;
