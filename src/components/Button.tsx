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
        return "bg-primary text-white hover:bg-primary-hover border-transparent";
      case "ghost":
        return "bg-transparent text-text-secondary border-border hover:bg-glass-bg";
      case "danger":
        return "bg-error text-white hover:opacity-90 border-transparent";
    }
  };

  const sizeClasses = () => {
    switch (size()) {
      case "md":
        return "h-9 px-4 text-sm font-medium";
      case "sm":
        return "h-7 px-3 text-xs font-medium";
    }
  };

  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`inline-flex items-center justify-center rounded-md border transition-colors duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)] disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses()} ${sizeClasses()} ${props.class ?? ""}`}
    >
      {props.children}
    </button>
  );
};

export default Button;
