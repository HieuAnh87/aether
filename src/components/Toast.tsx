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

function indicatorClasses(type: ToastItem["type"]): string {
  switch (type) {
    case "success":
      return "status-success";
    case "error":
      return "status-error";
    case "info":
      return "status-info";
  }
}

function ringClasses(type: ToastItem["type"]): string {
  switch (type) {
    case "success":
      return "ring-1 ring-success/12";
    case "error":
      return "ring-1 ring-error/12";
    case "info":
      return "ring-1 ring-info/12";
  }
}

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
                class={`surface-raised rounded-lg px-4 py-3 shadow-floating flex items-start gap-3 ${ringClasses(item.type)}`}
                style={{
                  animation: "toast-slide-in 200ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                <div class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${indicatorClasses(item.type)}`}>
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
                      class="text-current"
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
                      class="text-current"
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
                      class="text-current"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </Show>
                </div>

                <div class="min-w-0 flex-1">
                  <Show when={item.title}>
                    <p class="font-section-header text-text mb-0.5">
                      {item.title}
                    </p>
                  </Show>
                  <p class="font-body text-text-secondary leading-snug">
                    {item.message}
                  </p>
                </div>

                <button
                  onClick={() => removeToast(item.id)}
                  class="shrink-0 text-text-tertiary transition-colors mt-0.5 hover:text-text focus-ring rounded-md"
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
