import type { JSX } from "solid-js";

interface ButtonProps {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: () => void;
  children: JSX.Element;
  class?: string;
  type?: "button" | "submit";
}

const Button = (props: ButtonProps) => {
  const variant = () => props.variant ?? "primary";
  const size = () => props.size ?? "md";

  const variantClasses = () => {
    switch (variant()) {
      case "primary":
        return "button-primary";
      case "ghost":
        return "button-ghost";
      case "danger":
        return "border border-error/20 bg-error-muted text-error hover:border-error/30 hover:bg-error/20";
    }
  };

  const sizeClasses = () => {
    switch (size()) {
      case "md":
        return "h-9 px-4 text-sm";
      case "sm":
        return "h-8 px-3 text-xs";
    }
  };

  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`button focus-ring ${sizeClasses()} ${variantClasses()} ${props.class ?? ""}`}
    >
      {props.children}
    </button>
  );
};

export default Button;
