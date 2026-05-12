import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { requestStore, type FilterStatus } from "../stores/requestStore";
const STATUS_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Success", value: "success" },
  { label: "Error", value: "error" },
];

const RequestFilterBar: Component = () => {
  const activeProvider = () => requestStore.filterProvider();
  const activeStatus = () => requestStore.filterStatus();
  const query = () => requestStore.searchQuery();
  const hasActiveFilters = () => activeProvider() !== null || activeStatus() !== "all" || query().trim().length > 0;

  const chipBase =
    "focus-ring inline-flex items-center rounded-full border px-3 py-1.5 font-caption text-[11px] font-medium transition-colors";
  const chipActive = "border-primary bg-primary-muted text-text";
  const chipInactive = "border-border bg-transparent text-text-secondary hover:border-border-hover hover:bg-bg-elevated hover:text-text";

  return (
    <div class="border-b border-border bg-bg-surface px-5 py-3">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div class="min-w-0 flex-1 space-y-3">
          <div class="flex flex-wrap gap-3">
            <div class="min-w-0">
              <p class="mb-2 font-caption text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Provider</p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={activeProvider() === null}
                  aria-label="Filter requests by all providers"
                  class={`${chipBase} ${activeProvider() === null ? chipActive : chipInactive}`}
                  onClick={() => requestStore.setFilterProvider(null)}
                >
                  All
                </button>
                <For each={requestStore.providers()}>
                  {(provider) => (
                    <button
                      type="button"
                      aria-pressed={activeProvider() === provider}
                      aria-label={`Filter requests by ${provider}`}
                      class={`${chipBase} ${activeProvider() === provider ? chipActive : chipInactive}`}
                      onClick={() => requestStore.setFilterProvider(provider)}
                    >
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="min-w-0">
              <p class="mb-2 font-caption text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Result</p>
              <div class="flex flex-wrap gap-2">
                <For each={STATUS_OPTIONS}>
                  {({ label, value }) => (
                    <button
                      type="button"
                      aria-pressed={activeStatus() === value}
                      aria-label={`Show ${label.toLowerCase()} requests`}
                      class={`${chipBase} ${activeStatus() === value ? chipActive : chipInactive}`}
                      onClick={() => requestStore.setFilterStatus(value)}
                    >
                      {label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          <label class="block min-w-0 max-w-2xl">
            <span class="mb-2 block font-caption text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Search</span>
            <div class="relative">
              <input
                type="search"
                value={query()}
                placeholder="Search endpoint, method, provider"
                aria-label="Search requests by endpoint, method, or provider"
                class="field w-full px-3 py-2 pr-10 font-caption text-[12px]"
                onInput={(e) => requestStore.setSearchQuery(e.currentTarget.value)}
              />
              <Show when={query().length > 0}>
                <button
                  type="button"
                  aria-label="Clear search"
                  class="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 font-caption text-[11px] text-text-muted transition-colors hover:bg-bg-surface hover:text-text"
                  onClick={() => requestStore.setSearchQuery("")}
                >
                  Clear
                </button>
              </Show>
            </div>
          </label>
        </div>

        <Show when={hasActiveFilters()}>
          <div class="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2">
            <p class="font-caption text-[11px] text-text-muted">Filtered</p>
            <button
              type="button"
              class="button button-ghost h-8 px-2.5 text-[11px]"
              onClick={() => {
                requestStore.setFilterProvider(null);
                requestStore.setFilterStatus("all");
                requestStore.setSearchQuery("");
              }}
            >
              Reset
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default RequestFilterBar;
