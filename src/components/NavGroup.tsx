import type { JSX, Component } from "solid-js";
import { createSignal, createUniqueId, Show } from "solid-js";

interface NavGroupProps {
  icon: JSX.Element;
  label: string;
  defaultOpen?: boolean;
  children: JSX.Element;
}

const NavGroup: Component<NavGroupProps> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  const panelId = createUniqueId();

  return (
    <div class="w-full">
      <button
        type="button"
        class="group flex min-h-10 w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-text-secondary transition duration-150 ease-out cursor-pointer select-none hover:bg-bg-surface hover:text-text focus-ring focus:outline-none"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
        aria-controls={panelId}
      >
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-current">
          {props.icon}
        </span>
        <span class="min-w-0 flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-[0.12em] leading-none text-current">
          {props.label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          class={`shrink-0 transition-transform duration-200 ease-out ${open() ? "rotate-90 text-text" : "text-text-tertiary"}`}
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <Show when={open()}>
        <div id={panelId} class="mt-1 space-y-1 pl-3">
          {props.children}
        </div>
      </Show>
    </div>
  );
};

export default NavGroup;
