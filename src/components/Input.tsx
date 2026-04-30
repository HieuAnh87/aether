import type { Component } from "solid-js";
import { Show } from "solid-js";

interface InputProps {
  type?: "text" | "number" | "password";
  value?: string;
  onInput?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
}

const Input: Component<InputProps> = (props) => {
  const inputClass = () =>
    [
      "h-9 w-full rounded-md px-3",
      "bg-glass-bg border border-border",
      "text-base text-text placeholder:text-text-tertiary",
      "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary",
      "transition-colors duration-150",
      props.disabled ? "opacity-50 cursor-not-allowed" : "",
      props.error ? "border-error focus:border-error focus:ring-error" : "",
      props.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  const inputEl = (
    <input
      id={props.id}
      type={props.type ?? "text"}
      value={props.value ?? ""}
      placeholder={props.placeholder}
      disabled={props.disabled}
      class={inputClass()}
      onInput={(e) => props.onInput?.(e.currentTarget.value)}
    />
  );

  // If no label or error, return the raw input
  return (
    <Show
      when={props.label || props.error}
      fallback={inputEl}
    >
      <div class="flex flex-col gap-1">
        <Show when={props.label}>
          <label
            for={props.id}
            class="text-xs text-text-secondary font-medium"
          >
            {props.label}
          </label>
        </Show>
        {inputEl}
        <Show when={props.error}>
          <p class="text-xs text-error">{props.error}</p>
        </Show>
      </div>
    </Show>
  );
};

export default Input;
