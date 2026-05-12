import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children" | "class" | "disabled"> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
  children: JSX.Element;
  class?: string;
  type?: "button" | "submit" | "reset";
}

const Button = (props: ButtonProps) => {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "disabled",
    "loading",
    "loadingLabel",
    "children",
    "class",
    "type",
    "onClick",
  ]);

  const variant = () => props.variant ?? "primary";
  const size = () => props.size ?? "md";
  const disabled = () => Boolean(local.disabled || local.loading);

  const variantClasses = () => {
    switch (variant()) {
      case "primary":
        return "button-primary";
      case "secondary":
        return "button-secondary";
      case "ghost":
        return "button-ghost";
      case "danger":
        return "button-danger";
    }
  };

  const sizeClasses = () => {
    switch (size()) {
      case "md":
        return "h-9 px-4 text-sm";
      case "sm":
        return "h-8 px-3 text-xs";
      case "icon":
        return "h-9 w-9 p-0";
    }
  };

  return (
    <button
      {...rest}
      type={local.type ?? "button"}
      disabled={disabled()}
      aria-busy={local.loading ? "true" : undefined}
      data-loading={local.loading ? "true" : undefined}
      onClick={local.onClick}
      class={`button focus-ring ${sizeClasses()} ${variantClasses()} ${local.size === "icon" ? "button-icon-only" : ""} ${local.class ?? ""}`}
    >
      <Show when={local.loading}>
        <span class="button-spinner" aria-hidden="true" />
      </Show>
      <span class="min-w-0 truncate">
        <Show when={local.loading && local.loadingLabel} fallback={local.children}>
          {local.loadingLabel}
        </Show>
      </span>
    </button>
  );
};

export default Button;
