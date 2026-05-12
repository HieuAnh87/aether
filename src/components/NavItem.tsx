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
    "group flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition duration-150 ease-out cursor-pointer select-none focus-ring focus:outline-none";

  const activeClass =
    "border border-[color:var(--color-primary-muted)] bg-[color:var(--color-primary-muted)] text-text shadow-[inset_0_1px_0_var(--color-primary-soft),0_1px_2px_oklch(0.12_0.01_70_/_0.16)]";

  const inactiveClass =
    "border border-transparent text-text-secondary hover:border-border hover:bg-bg-surface hover:text-text";

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
          aria-pressed={props.active}
        >
          <Show when={props.icon}>
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-current"
            >
              {props.icon}
            </span>
          </Show>
          <span class="min-w-0 flex-1 truncate text-sm font-medium leading-none">
            {props.label}
          </span>
        </button>
      }
    >
      <a
        href={props.href}
        class={combinedClass()}
        onClick={props.onClick}
        aria-current={props.active ? "page" : undefined}
      >
        <Show when={props.icon}>
          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-current"
          >
            {props.icon}
          </span>
        </Show>
        <span class="min-w-0 flex-1 truncate text-sm font-medium leading-none">
          {props.label}
        </span>
      </a>
    </Show>
  );
};

export default NavItem;
