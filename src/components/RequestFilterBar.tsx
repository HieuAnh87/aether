import type { Component } from "solid-js";
import { requestStore, type FilterStatus } from "../stores/requestStore";

const PROVIDERS = ["anthropic", "openai", "google"] as const;
const STATUS_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
];

const RequestFilterBar: Component = () => {
  const activeProvider = () => requestStore.filterProvider();
  const activeStatus = () => requestStore.filterStatus();
  const query = () => requestStore.searchQuery();

  const chipBase = "inline-flex items-center px-3 py-1 rounded-full font-caption text-xs font-medium transition-colors cursor-pointer border";
  const chipActive = "bg-primary text-white border-primary";
  const chipInactive = "bg-transparent text-text-secondary border-border hover:bg-bg-elevated";

  return (
    <div class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-bg-elevated">
      {/* Provider filter */}
      <div class="flex items-center gap-1.5">
        <button
          class={`${chipBase} ${activeProvider() === null ? chipActive : chipInactive}`}
          onClick={() => requestStore.setFilterProvider(null)}
        >
          All
        </button>
        {PROVIDERS.map((provider) => (
          <button
            class={`${chipBase} ${activeProvider() === provider ? chipActive : chipInactive} capitalize`}
            onClick={() => requestStore.setFilterProvider(provider)}
          >
            {provider.charAt(0).toUpperCase() + provider.slice(1)}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div class="w-px h-5 bg-border" />

      {/* Status filter */}
      <div class="flex items-center gap-1.5">
        {STATUS_OPTIONS.map(({ label, value }) => (
          <button
            class={`${chipBase} ${activeStatus() === value ? chipActive : chipInactive}`}
            onClick={() => requestStore.setFilterStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div class="w-px h-5 bg-border" />

      {/* Search */}
      <div class="flex-1 min-w-[160px] max-w-xs">
        <input
          type="text"
          value={query()}
          placeholder="Search endpoints..."
          class="w-full h-7 px-3 rounded-md bg-glass-bg border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          onInput={(e) => requestStore.setSearchQuery(e.currentTarget.value)}
        />
      </div>
    </div>
  );
};

export default RequestFilterBar;
