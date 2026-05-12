import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

interface GlassCardProps {
  active?: boolean;
  children: JSX.Element;
  class?: string;
  onClick?: () => void;
  as?: "section" | "article" | "div";
}

const GlassCard = (props: GlassCardProps) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onClick();
    }
  };

  const activeStyles = "surface-selected";
  const interactiveStyles = props.onClick ? "surface-interactive focus-ring" : "";
  const Component = props.as ?? "div";

  return (
    <Dynamic
      component={Component}
      onClick={props.onClick}
      onKeyDown={handleKeyDown}
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      aria-pressed={props.onClick ? Boolean(props.active) : undefined}
      class={`surface-panel rounded-lg p-6 ${interactiveStyles} ${props.active ? activeStyles : ""} ${props.class ?? ""}`}
    >
      {props.children}
    </Dynamic>
  );
};

export default GlassCard;
