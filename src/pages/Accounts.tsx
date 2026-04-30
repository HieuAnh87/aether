import type { Component } from "solid-js";
import { createSignal, For, Show, Suspense } from "solid-js";
import { accountStore } from "../stores/accountStore";
import ProviderCard from "../components/ProviderCard";
import AddAccountModal from "../components/AddAccountModal";
import Button from "../components/Button";
import { useToast } from "../components/Toast";

const Accounts: Component = () => {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editProvider, setEditProvider] = createSignal<string | undefined>(undefined);

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
    if (!window.confirm(`Remove ${meta.name} API key? This will delete it from your Keychain.`)) {
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
    toast.success(`${meta.name} API key saved`);
  };

  return (
    <div>
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="font-title text-text">Accounts</h1>
          <p class="mt-1 font-body text-text-secondary">
            Manage provider API keys. Keys are stored securely in macOS Keychain.
          </p>
        </div>
        <Button variant="primary" onClick={handleAdd}>
          Add Account
        </Button>
      </div>

      <Suspense fallback={<p class="font-body text-text-muted">Loading accounts...</p>}>
        <Show
          when={accountStore.accounts()?.length}
          fallback={
            <div class="flex flex-col items-center justify-center py-20">
              <svg class="mb-4 h-16 w-16 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <h2 class="font-section-header text-text-secondary">No accounts configured</h2>
              <p class="mt-2 font-body text-text-muted">Add your first provider account to get started.</p>
              <Button variant="primary" class="mt-4" onClick={handleAdd}>
                Add Account
              </Button>
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <For each={accountStore.accounts()}>
              {(account) => (
                <ProviderCard
                  account={account}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                />
              )}
            </For>
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
