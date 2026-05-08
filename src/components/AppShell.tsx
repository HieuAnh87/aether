import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface AppShellProps {
  sidebar: JSX.Element;
  rightPanel?: JSX.Element;
  children: JSX.Element;
}

const AppShell = (props: AppShellProps) => {
  const handleDragMouseDown = async (e: MouseEvent) => {
    if (e.button !== 0) return;

    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Keep CSS drag region as fallback
    }
  };

  return (
    <div class="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      {props.sidebar}

      {/* Main content area */}
      <div class="relative flex flex-1 flex-col overflow-hidden">
        {/* Dedicated top drag bar */}
        <div
          data-tauri-drag-region
          class="h-9 flex-shrink-0 border-b border-border/60 bg-bg-elevated/60"
          onMouseDown={handleDragMouseDown}
        />

        {/* Scrollable content */}
        <main class="flex-1 overflow-y-auto p-6">
          {props.children}
        </main>
      </div>

      {/* Optional right panel */}
      <Show when={props.rightPanel !== undefined}>
        <div class="flex w-[300px] flex-shrink-0 flex-col border-l border-border bg-bg-elevated overflow-y-auto">
          {props.rightPanel}
        </div>
      </Show>
    </div>
  );
};

export default AppShell;
