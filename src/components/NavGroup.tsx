import type { JSX, Component } from "solid-js";
import { createSignal, Show } from "solid-js";

interface NavGroupProps {
  icon: JSX.Element;
  label: string;
  defaultOpen?: boolean;
  children: JSX.Element;
}

const NavGroup: Component<NavGroupProps> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  return (
    <div class="w-full">
      {/* Group header */}
      <button
        type="button"
        class="flex items-center gap-3 h-9 pl-4 pr-3 w-full text-text-secondary hover:text-text transition-colors duration-150 cursor-pointer select-none"
        onClick={() => setOpen(!open())}
      >
        <span class="shrink-0" style={{ width: "20px", height: "20px", display: "flex", "align-items": "center", "justify-content": "center" }}>
          {props.icon}
        </span>
        <span class="text-xs font-semibold uppercase tracking-wider leading-none flex-1 text-left truncate">
          {props.label}
        </span>
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          class={`shrink-0 transition-transform duration-200 ${open() ? "rotate-90" : ""}`}
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      {/* Sub-items */}
      <Show when={open()}>
        <div class="ml-2">
          {props.children}
        </div>
      </Show>
    </div>
  );
};

export default NavGroup;
