import {
  createContext,
  createSignal,
  useContext,
  For,
  Show,
  type ParentProps,
} from "solid-js";
import { Portal } from "solid-js/web";

// Types
interface ToastItem {
  id: string;
  type: "success" | "error" | "info";
  title?: string;
  message: string;
}

interface ToastAPI {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

// Context
const ToastContext = createContext<{ toast: ToastAPI }>();

// Hook
export function useToast() {
  return useContext(ToastContext)!;
}

// Border color per type
function borderClass(type: ToastItem["type"]): string {
  switch (type) {
    case "success":
      return "border-l-4 border-success";
    case "error":
      return "border-l-4 border-error";
    case "info":
      return "border-l-4 border-primary";
  }
}
// Provider
export function ToastProvider(props: ParentProps) {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);

  function addToast(type: ToastItem["type"], message: string, title?: string) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: ToastItem = { id, type, message, title };
    setToasts((prev) => [...prev, item]);

    // Auto-dismiss success and info after 3s; errors persist
    if (type !== "error") {
      setTimeout(() => removeToast(id), 3000);
    }
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const toast: ToastAPI = {
    success: (message, title) => addToast("success", message, title),
    error: (message, title) => addToast("error", message, title),
    info: (message, title) => addToast("info", message, title),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {props.children}
      <Portal>
        <div
          class="fixed top-4 right-4 z-50 flex flex-col gap-2"
          style={{ "max-width": "360px", width: "360px" }}
        >
          <For each={toasts()}>
            {(item) => (
              <div
                class={`glass rounded-md px-4 py-3 shadow-glass flex items-start gap-3 ${borderClass(item.type)}`}
                style={{
                  animation: "toast-slide-in 200ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {/* Icon */}
                <Show when={item.type === "success"}>
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
                    class="text-success shrink-0 mt-0.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </Show>
                <Show when={item.type === "error"}>
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
                    class="text-error shrink-0 mt-0.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </Show>
                <Show when={item.type === "info"}>
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
                    class="text-primary shrink-0 mt-0.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </Show>

                {/* Content */}
                <div class="flex-1 min-w-0">
                  <Show when={item.title}>
                    <p class="text-sm font-medium text-text mb-0.5">
                      {item.title}
                    </p>
                  </Show>
                  <p class="text-sm text-text-secondary leading-snug">
                    {item.message}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => removeToast(item.id)}
                  class="shrink-0 text-text-tertiary hover:text-text transition-colors mt-0.5"
                  aria-label="Dismiss"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Portal>

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes toast-slide-in {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
