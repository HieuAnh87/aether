import { listen } from "@tauri-apps/api/event";
import { presetStore } from "./presetStore";

let unlisten: (() => void) | null = null;

export async function initConfigWatcher() {
    unlisten = await listen<string>("config-changed", (event) => {
        const configType = event.payload;
        console.log(`[configWatcher] Detected external change to ${configType} config`);

        if (configType === "slim" || configType === "opencode") {
            // Refresh presets (which depends on both configs)
            presetStore.refresh();
        }
    });
}

export function cleanupConfigWatcher() {
    if (unlisten) {
        unlisten();
        unlisten = null;
    }
}
