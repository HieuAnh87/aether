import type { JSX } from "solid-js";

interface BadgeProps {
  variant?: "active" | "warning" | "error" | "neutral" | "anthropic" | "openai" | "google";
  children: JSX.Element;
  class?: string;
}

const Badge = (props: BadgeProps) => {
  const variantClasses = () => {
    switch (props.variant ?? "neutral") {
      case "active":
        return "bg-primary/20 text-primary";
      case "warning":
        return "bg-warning/20 text-warning";
      case "error":
        return "bg-error/20 text-error";
      case "neutral":
        return "bg-glass-bg text-text-secondary";
      case "anthropic":
        return "bg-anthropic/20 text-anthropic";
      case "openai":
        return "bg-openai/20 text-openai";
      case "google":
        return "bg-google/20 text-google";
    }
  };

  return (
    <span class={`inline-flex items-center rounded px-2 py-0.5 font-micro ${variantClasses()} ${props.class ?? ""}`}>
      {props.children}
    </span>
  );
};

export default Badge;
