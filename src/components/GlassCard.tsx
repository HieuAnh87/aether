import type { JSX } from "solid-js";

interface GlassCardProps {
  active?: boolean;
  children: JSX.Element;
  class?: string;
  onClick?: () => void;
}

const GlassCard = (props: GlassCardProps) => {
  const activeStyles = "border-l-[3px] border-l-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]";

  return (
    <div
      onClick={props.onClick}
      class={`glass rounded-lg p-6 ${props.active ? activeStyles : ""} ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
};

export default GlassCard;
