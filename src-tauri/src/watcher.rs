use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Watch config files for external changes and emit events to the frontend.
/// Uses a simple polling approach (checks file modification times every 2 seconds).
pub fn start_config_watcher(app_handle: AppHandle) {
    let slim_path = dirs::home_dir()
        .map(|h| h.join(".config/opencode/oh-my-opencode-slim.json"));
    let opencode_path = dirs::home_dir()
        .map(|h| h.join(".config/opencode/opencode.json"));

    tauri::async_runtime::spawn(async move {
        let mut last_slim_modified = get_modified_time(&slim_path);
        let mut last_opencode_modified = get_modified_time(&opencode_path);

        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;

            let current_slim = get_modified_time(&slim_path);
            if current_slim != last_slim_modified {
                last_slim_modified = current_slim;
                log::info!("Detected external change to oh-my-opencode-slim.json");
                app_handle.emit("config-changed", "slim").ok();
            }

            let current_opencode = get_modified_time(&opencode_path);
            if current_opencode != last_opencode_modified {
                last_opencode_modified = current_opencode;
                log::info!("Detected external change to opencode.json");
                app_handle.emit("config-changed", "opencode").ok();
            }
        }
    });
}

fn get_modified_time(path: &Option<PathBuf>) -> Option<std::time::SystemTime> {
    path.as_ref()
        .and_then(|p| std::fs::metadata(p).ok())
        .and_then(|m| m.modified().ok())
}
