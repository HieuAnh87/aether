import type { Component } from "solid-js";
import { Show } from "solid-js";
import Badge from "./Badge";
import Button from "./Button";
import type { ProviderAccountInfo } from "../stores/accountStore";
import { accountStore } from "../stores/accountStore";

interface ProviderCardProps {
  provider: string;
  account?: ProviderAccountInfo;
  onEdit: (provider: string) => void;
  onRemove: (provider: string) => void;
}

const ProviderCard: Component<ProviderCardProps> = (props) => {
  const meta = () => accountStore.getProviderMeta(props.provider);

  const hasKey = () => props.account?.hasKey ?? false;

  const status = () => props.account?.status ?? "missing";

  const statusBadgeVariant = () => {
    switch (status()) {
      case "verified":
        return "active" as const;
      case "unverified":
        return "warning" as const;
      case "error":
        return "error" as const;
      default:
        return "neutral" as const;
    }
  };

  const statusLabel = () => {
    switch (status()) {
      case "verified":
        return "Ready";
      case "unverified":
      case "error":
        return "Needs attention";
      default:
        return "Missing";
    }
  };

  const statusNote = () => {
    switch (status()) {
      case "verified":
        return "Verified and ready to use";
      case "unverified":
        return "Saved, not verified";
      case "error":
        return "Verification failed";
      default:
        return "Add a key to get started";
    }
  };

  return (
    <article class="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
      <div class="flex min-w-0 items-start gap-3">
        <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated">
          <img
            src={meta().logo}
            alt=""
            aria-hidden="true"
            class="h-5 w-5 object-contain"
          />
        </div>

        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-section-header text-text">{meta().name}</h3>
            <span
              class="h-2 w-2 rounded-full"
              style={{ "background-color": meta().color }}
              aria-hidden="true"
            />
            <Badge variant={statusBadgeVariant()}>{statusLabel()}</Badge>
          </div>

          <Show
            when={hasKey()}
            fallback={<p class="mt-1 font-mono text-sm text-text-muted">No key configured</p>}
          >
            <p class="mt-1 truncate font-mono text-sm text-text-secondary">{props.account?.maskedKey ?? "••••••••"}</p>
          </Show>

          <p class="mt-1 font-caption text-text-muted">{statusNote()}</p>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
        <Button
          variant={hasKey() ? "ghost" : "primary"}
          size="sm"
          onClick={() => props.onEdit(props.provider)}
        >
          {hasKey() ? "Update key" : "Add key"}
        </Button>

        <Show when={hasKey()}>
          <Button variant="ghost" size="sm" onClick={() => props.onRemove(props.provider)}>
            Remove
          </Button>
        </Show>
      </div>
    </article>
  );
};

export default ProviderCard;
