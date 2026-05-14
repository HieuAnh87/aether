import { createSignal } from "solid-js";
import { invokeCompat } from "./commandClient";

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

export interface ProviderModeEntry {
  app: "claude" | "codex" | "gemini" | "opencode" | "openclaw" | "hermes";
  mode: "exclusive" | "additive";
  supported: boolean;
  notes?: string | null;
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
const [modeMatrix, setModeMatrix] = createSignal<ProviderModeEntry[]>([]);

async function refresh(): Promise<void> {
  setLoading(true);
  try {
    const list = await invokeCompat<AgentProviderInfo[]>("get_agent_providers");
    setProviders(list);
  } finally {
    setLoading(false);
  }
}

async function loadWellKnown(): Promise<void> {
  const list = await invokeCompat<WellKnownProvider[]>("get_well_known_providers");
  setWellKnown(list);
}

async function loadModeMatrix(): Promise<void> {
  const matrix = await invokeCompat<ProviderModeEntry[]>("get_provider_mode_matrix");
  setModeMatrix(matrix);
}

async function addProvider(args: AddProviderArgs): Promise<void> {
  await invokeCompat<void>("add_agent_provider", {
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
  await invokeCompat<void>("update_agent_provider", {
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
  await invokeCompat<void>("delete_agent_provider", { id });
  await refresh();
}

async function fetchKey(id: string): Promise<string | null> {
  return invokeCompat<string | null>("get_agent_provider_key", { id });
}

async function fetchModels(id: string): Promise<string[]> {
  const models = await invokeCompat<string[]>("fetch_provider_models", { id });
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
  return invokeCompat<boolean>("validate_agent_provider_key", {
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
  modeMatrix,
  refresh,
  loadWellKnown,
  loadModeMatrix,
  addProvider,
  updateProvider,
  deleteProvider,
  fetchKey,
  fetchModels,
  validateKey,
};
