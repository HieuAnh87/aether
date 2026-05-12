import type { Component, JSX } from "solid-js";
import { Show, createUniqueId, splitProps } from "solid-js";

interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "value" | "onInput" | "class" | "type"> {
  type?: "text" | "number" | "password" | "url" | "email" | "search";
  value?: string;
  onInput?: (value: string) => void;
  placeholder?: string;
  label?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
}

const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, [
    "type",
    "value",
    "onInput",
    "placeholder",
    "label",
    "helper",
    "error",
    "disabled",
    "class",
    "id",
  ]);
  const fallbackId = createUniqueId();
  const inputId = () => local.id ?? fallbackId;
  const errorId = () => `${inputId()}-error`;
  const helperId = () => `${inputId()}-helper`;
  const describedBy = () => {
    const ids = [local.helper ? helperId() : undefined, local.error ? errorId() : undefined].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };

  const inputClass = () =>
    [
      "field h-9 px-3 text-sm font-body",
      "focus-ring",
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  const inputEl = (
    <input
      {...rest}
      id={inputId()}
      type={local.type ?? "text"}
      value={local.value ?? ""}
      placeholder={local.placeholder}
      disabled={local.disabled}
      aria-invalid={local.error ? "true" : undefined}
      aria-describedby={describedBy()}
      class={inputClass()}
      onInput={(e) => local.onInput?.(e.currentTarget.value)}
    />
  );

  return (
    <Show
      when={local.label || local.helper || local.error}
      fallback={inputEl}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={local.label}>
          <label
            for={inputId()}
            class="field-label font-caption"
          >
            {local.label}
          </label>
        </Show>
        {inputEl}
        <Show when={local.helper && !local.error}>
          <p id={helperId()} class="field-helper">
            {local.helper}
          </p>
        </Show>
        <Show when={local.error}>
          <p id={errorId()} class="field-error" role="alert">
            {local.error}
          </p>
        </Show>
      </div>
    </Show>
  );
};

export default Input;
