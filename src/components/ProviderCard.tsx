import type { Component } from "solid-js";
import { Show } from "solid-js";
import GlassCard from "./GlassCard";
import Badge from "./Badge";
import Button from "./Button";
import type { ProviderAccountInfo } from "../stores/accountStore";
import { accountStore } from "../stores/accountStore";

interface ProviderCardProps {
  account: ProviderAccountInfo;
  onEdit: (provider: string) => void;
  onRemove: (provider: string) => void;
}

const ProviderCard: Component<ProviderCardProps> = (props) => {
  const meta = () => accountStore.getProviderMeta(props.account.provider);

  const statusBadgeVariant = () => {
    switch (props.account.status) {
      case "verified": return "active" as const;
      case "unverified": return "warning" as const;
      case "error": return "error" as const;
      default: return "neutral" as const;
    }
  };

  const statusLabel = () => {
    switch (props.account.status) {
      case "verified": return "Verified";
      case "unverified": return "Unverified";
      case "error": return "Error";
      default: return "Not configured";
    }
  };

  return (
    <GlassCard>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          {/* Provider logo */}
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ "background-color": meta().color }}
          >
            <img
              src={meta().logo}
              alt={meta().name}
              class="h-5 w-5 object-contain invert"
            />
          </div>
          <div>
            <h3 class="font-section-header text-text">{meta().name}</h3>
            <Show
              when={props.account.hasKey}
              fallback={<p class="font-caption text-text-muted">No API key configured</p>}
            >
              <p class="font-mono text-text-secondary">{props.account.maskedKey}</p>
            </Show>
          </div>
        </div>
        <Badge variant={statusBadgeVariant()}>{statusLabel()}</Badge>
      </div>

      <Show when={props.account.hasKey}>
        <div class="mt-4 flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => props.onEdit(props.account.provider)}>
            Edit Key
          </Button>
          <Button variant="danger" size="sm" onClick={() => props.onRemove(props.account.provider)}>
            Remove
          </Button>
        </div>
      </Show>

      <Show when={!props.account.hasKey}>
        <div class="mt-4">
          <Button variant="primary" size="sm" onClick={() => props.onEdit(props.account.provider)}>
            Add API Key
          </Button>
        </div>
      </Show>
    </GlassCard>
  );
};

export default ProviderCard;
