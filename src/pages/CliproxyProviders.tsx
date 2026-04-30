import { useNavigate } from "@solidjs/router";
import GlassCard from "../components/GlassCard";
import Button from "../components/Button";

const CliproxyProviders = () => {
  const navigate = useNavigate();

  const families = [
    { id: "claude-api-key", label: "Claude (API Key)", route: "/api/provider/claude", desc: "Anthropic Claude API keys" },
    { id: "codex-api-key", label: "Codex (API Key)", route: "/api/provider/codex", desc: "OpenAI Codex API keys" },
    { id: "gemini-api-key", label: "Gemini (API Key)", route: "/api/provider/gemini", desc: "Google Gemini API keys" },
    { id: "vertex-api-key", label: "Vertex AI", route: "/api/provider/vertex", desc: "Google Vertex AI credentials" },
    { id: "openai-compat", label: "OpenAI-Compatible", route: "/api/provider/openai", desc: "Custom OpenAI-compatible endpoints" },
  ];

  return (
    <div class="space-y-4 pb-4">
      <div class="flex items-center justify-between">
        <h1 class="font-title text-text">AI Providers</h1>
        <Button variant="primary" size="sm" onClick={() => navigate("/cliproxy/control-panel")}>
          Manage in Control Panel →
        </Button>
      </div>

      <p class="font-body text-text-muted">
        Provider configuration is managed directly in the CLIProxyAPI Control Panel. Use the button above to open it.
      </p>

      {/* Provider families overview */}
      <GlassCard>
        <div class="space-y-1">
          <p class="font-label text-text-secondary mb-3">Available provider families</p>
          {families.map((f) => (
            <div class="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div>
                <p class="font-body text-text">{f.label}</p>
                <p class="font-caption text-text-muted">{f.desc}</p>
              </div>
              <code class="font-mono text-xs text-text-tertiary">{f.route}</code>
            </div>
          ))}
        </div>
      </GlassCard>

      <div class="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cliproxy/control-panel")}>
          Open Control Panel to configure providers
        </Button>
      </div>
    </div>
  );
};

export default CliproxyProviders;
