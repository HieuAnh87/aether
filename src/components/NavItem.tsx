import type { JSX, Component } from "solid-js";
import { Show } from "solid-js";

interface NavItemProps {
  icon?: JSX.Element;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  class?: string;
}

const NavItem: Component<NavItemProps> = (props) => {
  const baseClass =
    "flex items-center gap-3 h-11 pl-4 pr-3 rounded-r-md w-full transition-colors duration-150 cursor-pointer select-none";

  const activeClass =
    "border-l-[3px] border-primary bg-primary-muted text-text";

  const inactiveClass =
    "border-l-[3px] border-transparent text-text-secondary hover:bg-glass-bg";

  const stateClass = () => (props.active ? activeClass : inactiveClass);

  const combinedClass = () =>
    [baseClass, stateClass(), props.class].filter(Boolean).join(" ");

  return (
    <Show
      when={props.href}
      fallback={
        <button
          type="button"
          class={combinedClass()}
          onClick={props.onClick}
        >
          <Show when={props.icon}>
            <span
              class="shrink-0"
              style={{ width: "20px", height: "20px", display: "flex", "align-items": "center", "justify-content": "center" }}
            >
              {props.icon}
            </span>
          </Show>
          <span class="text-sm font-medium leading-none truncate">
            {props.label}
          </span>
        </button>
      }
    >
      <a
        href={props.href}
        class={combinedClass()}
        onClick={props.onClick}
      >
        <Show when={props.icon}>
          <span
            class="shrink-0"
            style={{ width: "20px", height: "20px", display: "flex", "align-items": "center", "justify-content": "center" }}
          >
            {props.icon}
          </span>
        </Show>
        <span class="text-sm font-medium leading-none truncate">
          {props.label}
        </span>
      </a>
    </Show>
  );
};

export default NavItem;
