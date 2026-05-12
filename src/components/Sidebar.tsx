import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface SidebarProps {
  proxyStatus?: "running" | "stopped" | "starting" | "stopping" | "degraded" | "crashed";
  proxyPort?: number;
  children: JSX.Element;
}

const Sidebar = (props: SidebarProps) => {
  const handleDragMouseDown = async (e: MouseEvent) => {
    if (e.button !== 0) return;

    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Keep CSS drag region as fallback
    }
  };

  const statusDot = () => {
    switch (props.proxyStatus) {
      case "running":
        return <span class="inline-block h-2 w-2 rounded-full bg-success flex-shrink-0" />;
      case "starting":
      case "stopping":
        return <span class="inline-block h-2 w-2 rounded-full bg-warning animate-pulse flex-shrink-0" />;
      case "degraded":
        return <span class="inline-block h-2 w-2 rounded-full bg-warning flex-shrink-0" />;
      case "stopped":
        return <span class="inline-block h-2 w-2 rounded-full bg-error flex-shrink-0" />;
      case "crashed":
        return <span class="inline-block h-2 w-2 rounded-full bg-error flex-shrink-0" />;
      default:
        return <span class="inline-block h-2 w-2 rounded-full bg-text-tertiary flex-shrink-0" />;
    }
  };

  const statusText = () => {
    switch (props.proxyStatus) {
      case "running":
        return <span class="font-mono text-text-secondary">localhost:{props.proxyPort ?? 8317}</span>;
      case "starting":
        return <span class="text-warning">Starting...</span>;
      case "stopping":
        return <span class="text-warning">Stopping...</span>;
      case "degraded":
        return <span class="text-warning">Degraded</span>;
      case "stopped":
        return <span class="text-text-secondary">Proxy stopped</span>;
      case "crashed":
        return <span class="text-error">Proxy crashed</span>;
      default:
        return <span class="text-text-tertiary">Unknown</span>;
    }
  };

  return (
    <div class="flex h-full min-h-0 w-[230px] flex-col border-r border-border bg-bg-elevated text-text">
      <div
        data-tauri-drag-region
        class="shrink-0 cursor-grab px-3 pt-3 active:cursor-grabbing"
        onMouseDown={handleDragMouseDown}
      >
        <div class="surface-inset flex items-center gap-3 rounded-[18px] border border-border-muted px-3 py-3 shadow-[var(--shadow-surface)]">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border bg-bg-surface text-[color:var(--color-primary)] shadow-[inset_0_1px_0_var(--color-primary-soft)]">
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none" class="flex-shrink-0" aria-hidden="true">
              <polygon points="50,10 84,30 84,70 50,90 16,70 16,30" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />
              <circle cx="50" cy="50" r="9" fill="currentColor" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-micro uppercase tracking-[0.14em] text-text-tertiary">Local proxy</div>
            <div class="truncate text-[15px] font-semibold leading-tight text-text">Aether</div>
          </div>
        </div>
      </div>

      <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
        {props.children}
      </nav>

      <div class="shrink-0 border-t border-border/80 px-3 pb-4 pt-3">
        <div class="surface-inset rounded-[16px] border border-border-muted px-3 py-3 shadow-[var(--shadow-surface)]">
          <div class="flex items-center justify-between gap-3">
            <span class="font-micro uppercase tracking-[0.14em] text-text-tertiary">Proxy status</span>
            <div class="flex items-center gap-2 text-xs text-text-secondary">
              {statusDot()}
              <Show when={props.proxyStatus !== undefined} fallback={<span class="text-text-tertiary">No proxy</span>}>
                {statusText()}
              </Show>
            </div>
          </div>
          <Show when={props.proxyStatus === "running"}>
            <div class="mt-2 font-mono text-[12px] text-text-tertiary">Ready on localhost:{props.proxyPort ?? 8317}</div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
