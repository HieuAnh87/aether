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
  const [provider, setProvider] = createSignal(props.editProvider || "anthropic");
  const [key, setKey] = createSignal("");
  const [validating, setValidating] = createSignal(false);
  const [validated, setValidated] = createSignal<boolean | null>(null); // null=not yet, true=valid, false=invalid
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  // Reset form when modal opens/closes or editProvider changes
  createEffect(() => {
    if (props.open) {
      setKey("");
      setValidated(null);
      setError("");
      if (props.editProvider) {
        setProvider(props.editProvider);
      }
    }
  });

  const handleValidate = async () => {
    if (!key().trim()) return;
    setValidating(true);
    setValidated(null);
    setError("");
    try {
      const valid = await accountStore.validateKey(provider(), key().trim());
      setValidated(valid);
      if (!valid) setError("API key appears to be invalid");
    } catch (e: unknown) {
      setValidated(false);
      setError(String(e));
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!key().trim()) return;
    setSaving(true);
    setError("");
    try {
      // Auto-validate before saving (failure still proceeds)
      setValidating(true);
      try {
        const valid = await accountStore.validateKey(provider(), key().trim());
        setValidated(valid);
        if (!valid) setError("API key appears to be invalid — saved anyway");
      } catch {
        // Validation network error — still save the key
        setValidated(null);
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

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.editProvider ? `Update ${selectedMeta().name} API Key` : "Add Provider Account"}
      size="md"
    >
      <div class="space-y-4">
        {/* Provider selector - only show if not editing existing */}
        <Show when={!props.editProvider}>
          <div>
            <label class="mb-1 block font-caption text-text-secondary">Provider</label>
            <div class="flex gap-2">
              <For each={["anthropic", "openai", "google", "vertexai"] as const}>
                {(p) => {
                  const meta = accountStore.getProviderMeta(p);
                  return (
                    <button
                      class={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        provider() === p
                          ? "bg-glass-bg border border-primary text-text"
                          : "border border-border text-text-secondary hover:border-text-muted"
                      }`}
                      onClick={() => setProvider(p)}
                    >
                      <span
                        class="inline-block h-3 w-3 rounded-full"
                        style={{ "background-color": meta.color }}
                      />
                      {meta.name}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* API Key input */}
        <Input
          label="API Key"
          type="password"
          value={key()}
          onInput={(val: string) => {
            setKey(val);
            setValidated(null);
          }}
          placeholder={`Enter your ${selectedMeta().name} API key`}
          error={error()}
        />

        {/* Validation status */}
        <Show when={validated() !== null}>
          <div class="flex items-center gap-2">
            <Show when={validated() === true}>
              <Badge variant="active">✓ Key verified</Badge>
            </Show>
            <Show when={validated() === false}>
              <Badge variant="warning">Key unverified — you can still save it</Badge>
            </Show>
          </div>
        </Show>

        {/* Actions */}
        <div class="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleValidate} disabled={!key().trim() || validating()}>
            {validating() ? "Validating..." : "Validate"}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!key().trim() || saving()}>
            {saving() ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AddAccountModal;
