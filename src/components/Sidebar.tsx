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
    <div class="flex h-full w-[220px] flex-col border-r border-border bg-bg-elevated">
      {/* Logo / App name area with drag region */}
      <div
        data-tauri-drag-region
        class="flex items-center gap-2 pt-8 px-4 pb-5"
        onMouseDown={handleDragMouseDown}
      >
        {/* Aether hexagon logo */}
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none" class="flex-shrink-0">
          <defs>
            <linearGradient id="sidebarLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#3B82F6"/>
              <stop offset="50%" stop-color="#6366F1"/>
              <stop offset="100%" stop-color="#8B5CF6"/>
            </linearGradient>
          </defs>
          <polygon points="50,8 87,29 87,71 50,92 13,71 13,29"
            stroke="url(#sidebarLogoGrad)" stroke-width="5" stroke-linejoin="round"/>
          <path d="M50 8L50 50 M13 29L50 50 M87 29L50 50 M13 71L50 50 M87 71L50 50 M50 92L50 50"
            stroke="url(#sidebarLogoGrad)" stroke-width="2.5" opacity="0.6"/>
          <circle cx="50" cy="50" r="10" fill="url(#sidebarLogoGrad)"/>
        </svg>
        <span class="text-base font-medium text-text leading-none">Aether</span>
      </div>

      {/* Navigation items */}
      <nav class="flex-1 overflow-y-auto px-2 py-1">
        {props.children}
      </nav>

      {/* Proxy status area */}
      <div class="border-t border-border p-4">
        <div class="flex items-center gap-2 text-xs text-text-secondary">
          {statusDot()}
          <Show when={props.proxyStatus !== undefined} fallback={<span class="text-text-tertiary">No proxy</span>}>
            {statusText()}
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
