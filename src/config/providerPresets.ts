export type ProviderPresetApp = "claude" | "codex" | "opencode";

export interface ProviderPresetTemplateField {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface ProviderPreset {
  id: string;
  app: ProviderPresetApp;
  category: "official" | "aggregator" | "third_party" | "custom";
  name: string;
  compatibility: "openai" | "anthropic";
  modelsEndpoint: boolean;
  baseUrlTemplate: string;
  templateFields?: ProviderPresetTemplateField[];
}

export const providerPresets: ProviderPreset[] = [
  {
    id: "claude-official",
    app: "claude",
    category: "official",
    name: "Claude Official",
    compatibility: "anthropic",
    modelsEndpoint: true,
    baseUrlTemplate: "https://api.anthropic.com/v1",
  },
  {
    id: "codex-official",
    app: "codex",
    category: "official",
    name: "OpenAI Official",
    compatibility: "openai",
    modelsEndpoint: true,
    baseUrlTemplate: "https://api.openai.com/v1",
  },
  {
    id: "openrouter-global",
    app: "opencode",
    category: "aggregator",
    name: "OpenRouter",
    compatibility: "openai",
    modelsEndpoint: true,
    baseUrlTemplate: "https://openrouter.ai/api/v1",
  },
  {
    id: "regional-gateway",
    app: "opencode",
    category: "third_party",
    name: "Regional Gateway",
    compatibility: "openai",
    modelsEndpoint: true,
    baseUrlTemplate: "https://${region}.gateway.example.com/v1",
    templateFields: [
      {
        key: "region",
        label: "Gateway Region",
        required: true,
        placeholder: "sg / us / eu",
      },
    ],
  },
];

export const presetCategoryLabels: Record<ProviderPreset["category"], string> = {
  official: "Official",
  aggregator: "Aggregator",
  third_party: "3rd Party",
  custom: "Custom",
};
