import { createSignal, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export type Theme = "dark" | "light";

const [theme, setTheme] = createSignal<Theme>("dark");

// Initialize: fetch theme from settings
async function init() {
  try {
    const settings = await invoke<{ theme: string }>("get_settings");
    setTheme(settings.theme as Theme);
  } catch {
    // Keep default dark
  }
}

// Call init immediately (module-level)
init();

// Apply theme to <html> element
createEffect(() => {
  const t = theme();
  document.documentElement.setAttribute("data-theme", t);
});

export const themeStore = {
  theme,
  setTheme,
};