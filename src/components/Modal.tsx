import type { JSX } from "solid-js";
import { Show, createEffect, createUniqueId, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: JSX.Element;
  class?: string;
  size?: "sm" | "md" | "lg";
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  footer?: JSX.Element;
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const Modal = (props: ModalProps) => {
  let dialogRef: HTMLDivElement | undefined;
  let previousActiveElement: Element | null = null;
  let previousBodyOverflow = "";
  const titleId = createUniqueId();

  // Escape key listener
  createEffect(() => {
    if (!props.open) return;

    previousActiveElement = document.activeElement;
    queueMicrotask(() => {
      const firstFocusable = dialogRef?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
      if (!firstFocusable) {
        dialogRef?.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.closeOnEscape !== false) {
        props.onClose();
      }

      if (e.key !== "Tab" || !dialogRef) return;
      const focusable = Array.from(
        dialogRef.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    });
  });

  const handleOverlayClick = (e: MouseEvent) => {
    // Only close when clicking the overlay itself, not the modal box
    if (props.closeOnOverlayClick !== false && e.target === e.currentTarget) {
      props.onClose();
    }
  };

  const sizeClass = () => sizeClasses[props.size ?? "md"];

  return (
    <Portal mount={document.body}>
      <Show when={props.open}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[color:var(--color-overlay)] p-4 transition-opacity duration-200"
          onClick={handleOverlayClick}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.title !== undefined ? titleId : undefined}
            tabIndex={-1}
            class={`surface-raised relative max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-xl transition-all duration-200 ${sizeClass()} ${props.class ?? ""}`}
          >
            <Show when={props.title !== undefined}>
              <div class="flex items-center justify-between border-b border-border/80 px-6 py-4 gap-3">
                <h2 id={titleId} class="font-section-header text-text text-wrap-safe bidi-auto" dir="auto" lang="und">{props.title}</h2>
                <button
                  type="button"
                  onClick={props.onClose}
                  class="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-primary-soft hover:text-text focus-ring"
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

            <div class="max-h-[calc(100vh-10rem)] overflow-y-auto p-6" data-selectable>
              {props.children}
            </div>
            <Show when={props.footer}>
              <div class="border-t border-border/80 bg-bg-elevated px-6 py-4">
                {props.footer}
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </Portal>
  );
};

export default Modal;
