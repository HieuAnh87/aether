import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { accountStore } from "../stores/accountStore";
import ProviderCard from "../components/ProviderCard";
import AddAccountModal from "../components/AddAccountModal";
import Button from "../components/Button";
import { useToast } from "../components/Toast";

const Accounts: Component = () => {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editProvider, setEditProvider] = createSignal<string | undefined>(undefined);

  const providerOrder = ["anthropic", "openai", "google", "vertexai"] as const;

  const providerRows = createMemo(() => {
    const accounts = accountStore.accounts() ?? [];
    const accountByProvider = new Map(accounts.map((account) => [account.provider, account]));

    const statusRank: Record<string, number> = {
      verified: 0,
      unverified: 1,
      error: 1,
      missing: 2,
    };

    const providerIndex = new Map(providerOrder.map((provider, index) => [provider, index]));

    return providerOrder
      .map((provider) => {
        const account = accountByProvider.get(provider);
        const status = account?.status ?? "missing";

        return {
          provider,
          account,
          status,
        };
      })
      .sort((a, b) => statusRank[a.status] - statusRank[b.status] || (providerIndex.get(a.provider) ?? 0) - (providerIndex.get(b.provider) ?? 0));
  });

  const configuredCount = createMemo(() => providerRows().filter((row) => row.status !== "missing").length);
  const readyCount = createMemo(() => providerRows().filter((row) => row.status === "verified").length);
  const attentionCount = createMemo(() => providerRows().filter((row) => row.status === "unverified" || row.status === "error").length);
  const missingCount = createMemo(() => providerRows().filter((row) => row.status === "missing").length);

  const handleEdit = (provider: string) => {
    setEditProvider(provider);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditProvider(undefined);
    setModalOpen(true);
  };

  const handleRemove = async (provider: string) => {
    const meta = accountStore.getProviderMeta(provider);
    if (!window.confirm(`Remove ${meta.name} key? This will delete it from your Keychain.`)) {
      return;
    }
    try {
      await accountStore.deleteAccount(provider);
      toast.success(`${meta.name} API key removed`);
    } catch (e: any) {
      toast.error(`Failed to remove key: ${e}`);
    }
  };

  const handleSuccess = (provider: string) => {
    const meta = accountStore.getProviderMeta(provider);
    toast.success(`${meta.name} key ${editProvider() ? "updated" : "saved"}`);
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <div class="inline-flex items-center rounded-full border border-border/70 bg-bg-surface px-3 py-1 font-caption text-xs text-text-secondary">
            Keys stay in macOS Keychain.
          </div>
          <div>
            <h1 class="font-title text-text">Accounts</h1>
            <p class="mt-1 max-w-2xl font-body text-text-secondary">
              Check which provider keys are ready, which need attention, and add or update a key in a few steps.
            </p>
          </div>
        </div>

        <Button variant="primary" onClick={handleAdd}>
          Add key
        </Button>
      </div>

      <Suspense
        fallback={
          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-3">
              <div class="h-24 animate-pulse rounded-xl border border-border/80 bg-bg-surface" />
              <div class="h-24 animate-pulse rounded-xl border border-border/80 bg-bg-surface" />
              <div class="h-24 animate-pulse rounded-xl border border-border/80 bg-bg-surface" />
            </div>

            <div class="overflow-hidden rounded-xl border border-border/80 bg-bg-surface shadow-panel">
              <div class="h-14 animate-pulse border-b border-border/70 bg-bg-elevated/60" />
              <div class="divide-y divide-border/70 px-4">
                <For each={[0, 1, 2]}>
                  {(_index) => (
                    <div class="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                      <div class="flex min-w-0 items-start gap-3">
                        <div class="mt-0.5 h-10 w-10 shrink-0 animate-pulse rounded-lg bg-border/30" />
                        <div class="min-w-0 space-y-2">
                          <div class="h-4 w-28 animate-pulse rounded bg-border/30" />
                          <div class="h-3 w-40 animate-pulse rounded bg-border/20" />
                          <div class="h-3 w-32 animate-pulse rounded bg-border/20" />
                        </div>
                      </div>
                      <div class="flex gap-2">
                        <div class="h-8 w-24 animate-pulse rounded-md bg-border/30" />
                        <div class="h-8 w-20 animate-pulse rounded-md bg-border/20" />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        }
      >
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-xl border border-border/80 bg-bg-surface px-4 py-4 shadow-panel">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <p class="font-caption text-text-secondary">Ready</p>
            </div>
            <p class="mt-2 font-title text-text">{readyCount()}</p>
            <p class="mt-1 font-caption text-text-muted">Verified and ready to use</p>
          </div>

          <div class="rounded-xl border border-border/80 bg-bg-surface px-4 py-4 shadow-panel">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
              <p class="font-caption text-text-secondary">Needs attention</p>
            </div>
            <p class="mt-2 font-title text-text">{attentionCount()}</p>
            <p class="mt-1 font-caption text-text-muted">Saved, not verified or failed to verify</p>
          </div>

          <div class="rounded-xl border border-border/80 bg-bg-surface px-4 py-4 shadow-panel">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-border" aria-hidden="true" />
              <p class="font-caption text-text-secondary">Missing</p>
            </div>
            <p class="mt-2 font-title text-text">{missingCount()}</p>
            <p class="mt-1 font-caption text-text-muted">Add a key to unlock the provider</p>
          </div>
        </div>

        <Show
          when={configuredCount() > 0}
          fallback={
            <div class="rounded-xl border border-border/80 bg-bg-surface p-6 text-center shadow-panel">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-bg-elevated">
                <svg class="h-6 w-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 7.5v9m4.5-4.5h-9m13.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 class="mt-4 font-section-header text-text">Add your first key</h2>
              <p class="mt-2 font-body text-text-muted">Choose a provider, paste the key, and verify it when you’re ready.</p>
              <Button variant="primary" class="mt-4" onClick={handleAdd}>
                Add key
              </Button>
            </div>
          }
        >
          <div class="overflow-hidden rounded-xl border border-border/80 bg-bg-surface shadow-panel">
            <div class="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p class="font-section-header text-text">Provider keys</p>
                <p class="font-caption text-text-muted">{configuredCount()} of {providerRows().length} configured</p>
              </div>
              <p class="font-caption text-text-muted">Verified rows appear first</p>
            </div>

            <div class="divide-y divide-border/70 px-4">
              <For each={providerRows()}>
                {(row) => (
                  <ProviderCard
                    provider={row.provider}
                    account={row.account}
                    onEdit={handleEdit}
                    onRemove={handleRemove}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
      </Suspense>

      <AddAccountModal
        open={modalOpen()}
        onClose={() => setModalOpen(false)}
        editProvider={editProvider()}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default Accounts;
