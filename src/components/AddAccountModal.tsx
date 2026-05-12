import type { Component } from "solid-js";
import { createSignal, createEffect, For, Show } from "solid-js";
import Modal from "./Modal";
import Button from "./Button";
import Input from "./Input";
import Badge from "./Badge";
import { accountStore } from "../stores/accountStore";

interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
  /** If set, we're editing an existing provider's key */
  editProvider?: string;
  onSuccess: (provider: string) => void;
}

const AddAccountModal: Component<AddAccountModalProps> = (props) => {
  const providerOptions = ["anthropic", "openai", "google", "vertexai"] as const;

  const [provider, setProvider] = createSignal(props.editProvider || "anthropic");
  const [key, setKey] = createSignal("");
  const [validating, setValidating] = createSignal(false);
  const [validated, setValidated] = createSignal<boolean | null>(null); // null=not yet, true=valid, false=invalid
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [statusText, setStatusText] = createSignal("");

  // Reset form when modal opens/closes or editProvider changes
  createEffect(() => {
    if (!props.open) {
      return;
    }

    setProvider(props.editProvider ?? "anthropic");
    setKey("");
    setValidated(null);
    setError("");
    setStatusText("");
    setValidating(false);
    setSaving(false);
  });

  const handleValidate = async () => {
    if (!key().trim()) return;
    setValidating(true);
    setValidated(null);
    setError("");
    setStatusText("");
    try {
      const valid = await accountStore.validateKey(provider(), key().trim());
      setValidated(valid);
      setStatusText(valid ? "Verified with provider." : "You can still save this key.");
      if (!valid) setError("Couldn’t verify this key.");
    } catch (e: unknown) {
      setValidated(false);
      setStatusText("Needs attention");
      setError(e instanceof Error ? e.message : "Couldn’t verify this key.");
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!key().trim()) return;
    setSaving(true);
    setError("");
    setStatusText("");
    try {
      // Auto-validate before saving (failure still proceeds)
      setValidating(true);
      try {
        const valid = await accountStore.validateKey(provider(), key().trim());
        setValidated(valid);
        setStatusText(valid ? "Saved to Keychain." : "Saved to Keychain, not verified.");
        if (!valid) setError("Saved, not verified.");
      } catch {
        // Validation network error. Still save the key.
        setValidated(null);
        setStatusText("Saved to Keychain. Validation was skipped.");
      } finally {
        setValidating(false);
      }

      if (props.editProvider) {
        await accountStore.updateKey(provider(), key().trim());
      } else {
        await accountStore.addAccount(provider(), key().trim());
      }
      props.onSuccess(provider());
      props.onClose();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = () => accountStore.getProviderMeta(provider());

  const saveLabel = () => (props.editProvider ? "Update key" : "Save key");

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.editProvider ? `Update ${selectedMeta().name} key` : "Add key"}
      size="lg"
    >
      <div class="space-y-5">
        <div class="rounded-lg border border-border/80 bg-bg-elevated px-4 py-3">
          <p class="font-body text-text">Keys stay in macOS Keychain.</p>
          <p class="mt-1 font-caption text-text-muted">
            {props.editProvider
              ? "Update the saved key or validate it before you switch models."
              : "Pick a provider, paste the key, and validate it if you want a quick check."}
          </p>
        </div>

        {/* Provider selector - only show if not editing existing */}
        <Show when={!props.editProvider}>
          <div>
            <label class="mb-2 block font-caption text-text-secondary">Provider</label>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <For each={providerOptions}>
                {(p) => {
                  const meta = accountStore.getProviderMeta(p);
                  const selected = () => provider() === p;

                  return (
                    <button
                      type="button"
                      aria-pressed={selected()}
                      class={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-ring ${
                        selected()
                          ? "border-primary bg-primary-soft text-text"
                          : "border-border bg-bg-surface text-text-secondary hover:border-border-hover hover:bg-bg-surface-hover"
                      }`}
                      onClick={() => setProvider(p)}
                    >
                      <img src={meta.logo} alt="" aria-hidden="true" class="h-4 w-4 object-contain" />
                      <span class="truncate">{meta.name}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* API Key input */}
        <Input
          id="provider-key"
          label="Key"
          type="password"
          value={key()}
          onInput={(val: string) => {
            setKey(val);
            setValidated(null);
            setStatusText("");
            setError("");
          }}
          placeholder={`Paste the ${selectedMeta().name} key`}
          error={error()}
        />

        {/* Validation status */}
        <Show when={validated() !== null || validating() || statusText()}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={validating()}>
              <Badge variant="neutral">Validating…</Badge>
            </Show>
            <Show when={validated() === true && !validating()}>
              <Badge variant="active">Ready</Badge>
            </Show>
            <Show when={validated() === false && !validating()}>
              <Badge variant="warning">Needs attention</Badge>
            </Show>
            <Show when={statusText()}>
              <span class="font-caption text-text-muted">{statusText()}</span>
            </Show>
          </div>
        </Show>

        {/* Actions */}
        <div class="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={handleValidate}
            disabled={!key().trim() || validating() || saving()}
            loading={validating()}
            loadingLabel="Validating..."
          >
            Validate
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!key().trim() || saving() || validating()}
            loading={saving()}
            loadingLabel="Saving..."
          >
            {saveLabel()}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AddAccountModal;
