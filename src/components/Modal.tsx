import type { JSX } from "solid-js";
import { Show, createEffect, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  class?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const Modal = (props: ModalProps) => {
  // Escape key listener
  createEffect(() => {
    if (!props.open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  const handleOverlayClick = (e: MouseEvent) => {
    // Only close when clicking the overlay itself, not the modal box
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  const sizeClass = () => sizeClasses[props.size ?? "md"];

  return (
    <Portal mount={document.body}>
      <Show when={props.open}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-[color:var(--color-overlay)] transition-opacity duration-200"
          onClick={handleOverlayClick}
        >
          <div
            class={`surface-raised relative w-full rounded-xl transition-all duration-200 ${sizeClass()} ${props.class ?? ""}`}
            style={{ margin: "1rem" }}
          >
            <Show when={props.title !== undefined}>
              <div class="flex items-center justify-between border-b border-border/80 px-6 py-4">
                <span class="font-section-header text-text">{props.title}</span>
                <button
                  type="button"
                  onClick={props.onClose}
                  class="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-primary-soft hover:text-text focus-ring"
                  aria-label="Close modal"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </Show>

            <div class="p-6">
              {props.children}
            </div>
          </div>
        </div>
      </Show>
    </Portal>
  );
};

export default Modal;
