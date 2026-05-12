import { createSignal, createEffect } from "solid-js";
import { Modal, Input, Button } from "../components";
import { presetStore } from "../stores/presetStore";

interface CreatePresetModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

const NAME_REGEX = /^[A-Za-z0-9_-]+$/;

const CreatePresetModal = (props: CreatePresetModalProps) => {
  const [name, setName] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  // Clear input when modal opens
  createEffect(() => {
    if (props.open) {
      setName("");
    }
  });

  const nameError = () => {
    const n = name();
    if (n.length === 0) return undefined;
    if (!NAME_REGEX.test(n)) return "Only letters, numbers, _ and - are allowed";
    const existing = presetStore.presets() ?? [];
    if (existing.some((p) => p.name === n)) return "A preset with this name already exists";
    return undefined;
  };

  const isValid = () => {
    const n = name();
    return n.length > 0 && nameError() === undefined;
  };

  const handleCreate = async () => {
    if (!isValid() || loading()) return;
    setLoading(true);
    try {
      await props.onCreate(name());
      setName("");
      props.onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={props.open} onClose={props.onClose} title="Create Preset" size="sm">
      <div class="flex flex-col gap-4">
        <Input
          label="Preset Name"
          placeholder="my-preset"
          value={name()}
          onInput={(val) => setName(val)}
          error={nameError()}
        />

        <div class="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onClose}
            disabled={loading()}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={!isValid() || loading()}
            loading={loading()}
            loadingLabel="Creating..."
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CreatePresetModal;
