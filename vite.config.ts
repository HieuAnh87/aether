import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// https://v2.tauri.app/start/frontend/solidjs/
export default defineConfig({
  plugins: [solid(), tailwindcss()],

  // prevent vite from obscuring rust errors
  clearScreen: false,

  server: {
    // Tauri expects a fixed port, fail if that port is not available
    strictPort: true,
    // use a predictable port for Tauri
    port: 1420,
  },

  // Env variables starting with TAURI_ are exposed to the client
  envPrefix: ["VITE_", "TAURI_ENV_*"],

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
