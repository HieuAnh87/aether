import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invokeCompat } from "./commandClient";

export type SwitchAppId = "claude" | "codex" | "opencode";

export interface SwitchProvider {
  id: string;
  name: string;
  app: SwitchAppId;
  category?: string;
  settingsConfig?: unknown;
  sortIndex?: number;
  createdAt?: number;
  meta?: unknown;
}

export interface ProviderSortUpdate {
  id: string;
  sortIndex: number;
}

export interface SwitchResult {
  warnings: string[];
}

export interface ProviderSwitchedEvent {
  appType: SwitchAppId;
  providerId: string;
  providerName?: string;
  proxyEnabled?: boolean;
  autoFailoverEnabled?: boolean;
}

export interface OpenCodeModelsRefreshedEvent {
  configured?: boolean;
}

export interface OpenCodeConfigWarningEvent {
  message: string;
}

export const providerSwitchStore = {
  async getAll(app: SwitchAppId): Promise<Record<string, SwitchProvider>> {
    return invokeCompat<Record<string, SwitchProvider>>("get_providers", { app });
  },

  async getCurrent(app: SwitchAppId): Promise<string> {
    return invokeCompat<string>("get_current_provider", { app });
  },

  async add(
    app: SwitchAppId,
    provider: SwitchProvider,
    addToLive?: boolean,
  ): Promise<boolean> {
    return invokeCompat<boolean>("add_provider", { app, provider, addToLive });
  },

  async update(
    app: SwitchAppId,
    provider: SwitchProvider,
    originalId?: string,
  ): Promise<boolean> {
    return invokeCompat<boolean>("update_provider", { app, provider, originalId });
  },

  async delete(app: SwitchAppId, id: string): Promise<boolean> {
    return invokeCompat<boolean>("delete_provider", { app, id });
  },

  async removeFromLiveConfig(app: SwitchAppId, id: string): Promise<boolean> {
    return invokeCompat<boolean>("remove_provider_from_live_config", { app, id });
  },

  async switch(app: SwitchAppId, id: string): Promise<SwitchResult> {
    return invokeCompat<SwitchResult>("switch_provider", { app, id });
  },

  async importDefault(app: SwitchAppId): Promise<boolean> {
    return invokeCompat<boolean>("import_default_config", { app });
  },

  async importFromLive(app: SwitchAppId): Promise<number> {
    return invokeCompat<number>("import_providers_from_live", { app });
  },

  async updateSortOrder(app: SwitchAppId, updates: ProviderSortUpdate[]): Promise<boolean> {
    return invokeCompat<boolean>("update_providers_sort_order", { app, updates });
  },

  async updateTrayMenu(): Promise<boolean> {
    return invokeCompat<boolean>("update_tray_menu");
  },

  async traySelectProvider(app: SwitchAppId, providerId: string): Promise<SwitchResult> {
    return invokeCompat<SwitchResult>("tray_select_provider", { app, providerId });
  },

  async onSwitched(
    handler: (event: ProviderSwitchedEvent) => void,
  ): Promise<UnlistenFn> {
    return listen<ProviderSwitchedEvent>("provider-switched", (event) => {
      handler(event.payload);
    });
  },

  async onProxyFlagsChanged(
    handler: (event: ProviderSwitchedEvent) => void,
  ): Promise<UnlistenFn> {
    return listen<ProviderSwitchedEvent>("proxy-flags-changed", (event) => {
      handler(event.payload);
    });
  },

  async onTrayMenuUpdated(handler: () => void): Promise<UnlistenFn> {
    return listen("tray-menu-updated", () => handler());
  },

  async onOpenCodeModelsRefreshed(
    handler: (event: OpenCodeModelsRefreshedEvent) => void,
  ): Promise<UnlistenFn> {
    return listen<OpenCodeModelsRefreshedEvent>("opencode-models-refreshed", (event) => {
      handler(event.payload);
    });
  },

  async onOpenCodeConfigWarning(
    handler: (event: OpenCodeConfigWarningEvent) => void,
  ): Promise<UnlistenFn> {
    return listen<OpenCodeConfigWarningEvent>("opencode-config-warning", (event) => {
      handler(event.payload);
    });
  },
};
