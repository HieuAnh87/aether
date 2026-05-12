import type { JSX } from "solid-js";

interface BadgeProps {
  variant?: "active" | "success" | "warning" | "error" | "info" | "neutral" | "anthropic" | "openai" | "google" | "vertexai";
  children: JSX.Element;
  class?: string;
  title?: string;
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
      case "success":
        return "status-success border-success/20";
      case "warning":
        return "status-warning border-warning/20";
      case "error":
        return "status-error border-error/20";
      case "info":
        return "status-info border-info/20";
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
    <span class={`chip ${variantClasses()} ${props.class ?? ""}`} title={props.title}>
      <span class="chip-content">{props.children}</span>
    </span>
  );
};

export default Badge;
