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
  const errorId = () => (props.id ? `${props.id}-error` : undefined);

  const inputClass = () =>
    [
      "field h-9 px-3 text-sm font-body",
      "focus-ring",
      props.error ? "border-error/70 focus:border-error" : "",
      props.disabled ? "cursor-not-allowed" : "",
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
      aria-invalid={props.error ? "true" : undefined}
      aria-describedby={errorId()}
      class={inputClass()}
      onInput={(e) => props.onInput?.(e.currentTarget.value)}
    />
  );

  return (
    <Show
      when={props.label || props.error}
      fallback={inputEl}
    >
      <div class="flex flex-col gap-1">
        <Show when={props.label}>
          <label
            for={props.id}
            class="font-caption text-text-secondary"
          >
            {props.label}
          </label>
        </Show>
        {inputEl}
        <Show when={props.error}>
          <p id={errorId()} class="font-caption text-error">
            {props.error}
          </p>
        </Show>
      </div>
    </Show>
  );
};

export default Input;
