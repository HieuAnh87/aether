import { createSignal, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface ProviderAccountInfo {
  provider: string;
  hasKey: boolean;
  maskedKey: string | null;
  status: string; // "verified" | "unverified" | "none"
}

const PROVIDER_META: Record<string, { name: string; color: string; icon: string }> = {
  anthropic: { name: "Anthropic", color: "#A855F7", icon: "A" },
  openai: { name: "OpenAI", color: "#10B981", icon: "O" },
  google: { name: "Google", color: "#3B82F6", icon: "G" },
};

const [version, setVersion] = createSignal(0);

const [accounts] = createResource(
  version,
  async () => {
    const result = await invoke<ProviderAccountInfo[]>("get_provider_accounts");
    return result;
  }
);

async function addAccount(provider: string, key: string): Promise<void> {
  await invoke("add_provider_account", { provider, key });
  setVersion((v) => v + 1);
}

async function updateKey(provider: string, key: string): Promise<void> {
  await invoke("update_api_key", { provider, key });
  setVersion((v) => v + 1);
}

async function deleteAccount(provider: string): Promise<void> {
  await invoke("delete_provider_account", { provider });
  setVersion((v) => v + 1);
}

async function validateKey(provider: string, key: string): Promise<boolean> {
  return await invoke<boolean>("validate_api_key", { provider, key });
}

function refresh(): void {
  setVersion((v) => v + 1);
}

function getProviderMeta(provider: string) {
  return PROVIDER_META[provider] || { name: provider, color: "#6B7280", icon: "?" };
}

export const accountStore = {
  accounts,
  addAccount,
  updateKey,
  deleteAccount,
  validateKey,
  refresh,
  getProviderMeta,
  PROVIDER_META,
};
