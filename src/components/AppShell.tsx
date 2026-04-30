import type { JSX } from "solid-js";
import { Show } from "solid-js";

interface AppShellProps {
  sidebar: JSX.Element;
  rightPanel?: JSX.Element;
  children: JSX.Element;
}

const AppShell = (props: AppShellProps) => {
  return (
    <div class="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      {props.sidebar}

      {/* Main content area */}
      <div class="relative flex flex-1 flex-col overflow-hidden">
        {/* Invisible titlebar drag region at the top of the content area */}
        <div
          data-tauri-drag-region
          class="h-7 w-full flex-shrink-0"
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
