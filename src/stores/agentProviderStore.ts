import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  compatibility: "openai" | "anthropic";
  modelsEndpoint: boolean;
  models: string[];
  headers: Record<string, string>;
  hasKey: boolean;
  maskedKey?: string;
}

export interface WellKnownProvider {
  id: string;
  name: string;
  baseUrl: string;
  compatibility: "openai" | "anthropic";
  modelsEndpoint: boolean;
}

export interface AddProviderArgs {
  id: string;
  name: string;
  baseUrl: string;
  compatibility: string;
  modelsEndpoint: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface UpdateProviderArgs {
  id: string;
  name?: string;
  baseUrl?: string;
  compatibility?: string;
  modelsEndpoint?: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const [providers, setProviders] = createSignal<AgentProviderInfo[]>([]);
const [loading, setLoading] = createSignal(false);
const [wellKnown, setWellKnown] = createSignal<WellKnownProvider[]>([]);

async function refresh(): Promise<void> {
  setLoading(true);
  try {
    const list = await invoke<AgentProviderInfo[]>("get_agent_providers");
    setProviders(list);
  } finally {
    setLoading(false);
  }
}

async function loadWellKnown(): Promise<void> {
  const list = await invoke<WellKnownProvider[]>("get_well_known_providers");
  setWellKnown(list);
}

async function addProvider(args: AddProviderArgs): Promise<void> {
  await invoke("add_agent_provider", {
    id: args.id,
    name: args.name,
    baseUrl: args.baseUrl,
    compatibility: args.compatibility,
    modelsEndpoint: args.modelsEndpoint,
    apiKey: args.apiKey ?? null,
    headers: args.headers ?? null,
  });
  await refresh();
}

async function updateProvider(args: UpdateProviderArgs): Promise<void> {
  await invoke("update_agent_provider", {
    id: args.id,
    name: args.name ?? null,
    baseUrl: args.baseUrl ?? null,
    compatibility: args.compatibility ?? null,
    modelsEndpoint: args.modelsEndpoint ?? null,
    apiKey: args.apiKey ?? null,
    headers: args.headers ?? null,
  });
  await refresh();
}

async function deleteProvider(id: string): Promise<void> {
  await invoke("delete_agent_provider", { id });
  await refresh();
}

async function fetchModels(id: string): Promise<string[]> {
  const models = await invoke<string[]>("fetch_provider_models", { id });
  // Refresh local state to pick up cached model list
  await refresh();
  return models;
}

async function validateKey(
  baseUrl: string,
  compatibility: string,
  apiKey: string,
  headers?: Record<string, string>,
): Promise<boolean> {
  return invoke<boolean>("validate_agent_provider_key", {
    baseUrl,
    compatibility,
    apiKey,
    headers: headers ?? null,
  });
}

export const agentProviderStore = {
  providers,
  loading,
  wellKnown,
  refresh,
  loadWellKnown,
  addProvider,
  updateProvider,
  deleteProvider,
  fetchModels,
  validateKey,
};
