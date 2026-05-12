import type { JSX } from "solid-js";

interface GlassCardProps {
  active?: boolean;
  children: JSX.Element;
  class?: string;
  onClick?: () => void;
}

const GlassCard = (props: GlassCardProps) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onClick();
    }
  };

  const activeStyles = "border-border-strong bg-bg-surface-strong shadow-floating ring-1 ring-primary/10";

  return (
    <div
      onClick={props.onClick}
      onKeyDown={handleKeyDown}
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      class={`surface-panel rounded-lg p-6 transition-all duration-200 ${props.onClick ? "cursor-pointer hover:border-border-hover hover:bg-bg-surface-hover" : ""} ${props.active ? activeStyles : ""} ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
};

export default GlassCard;
