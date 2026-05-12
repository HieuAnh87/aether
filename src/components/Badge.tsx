import type { JSX } from "solid-js";

interface BadgeProps {
  variant?: "active" | "warning" | "error" | "neutral" | "anthropic" | "openai" | "google" | "vertexai";
  children: JSX.Element;
  class?: string;
}

const Badge = (props: BadgeProps) => {
  const providerTone = () => {
    switch (props.variant) {
      case "anthropic":
        return "border border-anthropic/20 bg-bg-elevated text-anthropic";
      case "openai":
        return "border border-openai/20 bg-bg-elevated text-openai";
      case "google":
        return "border border-google/20 bg-bg-elevated text-google";
      case "vertexai":
        return "border border-vertexai/20 bg-bg-elevated text-vertexai";
      default:
        return "";
    }
  };

  const variantClasses = () => {
    switch (props.variant ?? "neutral") {
      case "active":
        return "chip-active";
      case "warning":
        return "status-warning";
      case "error":
        return "status-error";
      case "neutral":
        return "chip-muted";
      case "anthropic":
      case "openai":
      case "google":
      case "vertexai":
        return providerTone();
    }
  };

  return (
    <span class={`chip ${variantClasses()} ${props.class ?? ""}`}>
      {props.children}
    </span>
  );
};

export default Badge;
