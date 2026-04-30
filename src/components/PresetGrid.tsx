import type { JSX } from "solid-js";

interface PresetGridProps {
  children: JSX.Element;
}

const PresetGrid = (props: PresetGridProps) => {
  return (
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {props.children}
    </div>
  );
};

export default PresetGrid;
