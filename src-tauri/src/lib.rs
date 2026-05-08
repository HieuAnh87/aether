mod commands;
mod config;
mod core;
mod keychain;
mod proxy;
mod secrets;
mod watcher;

use proxy::ProxyState;
use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

/// Check if auto-start proxy is enabled in ~/.config/aether/settings.json.
/// Returns false if file doesn't exist or can't be parsed (safe default).
fn check_auto_start_setting() -> bool {
    let Some(config_dir) = dirs::config_dir() else {
        return false;
    };
    let settings_path = config_dir.join("aether").join("settings.json");
    let Ok(content) = std::fs::read_to_string(&settings_path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    value
        .get("auto_start_proxy")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Toggle the popup window: show below the tray icon if hidden, hide if visible.
fn toggle_popup(app: &tauri::AppHandle) {
    let Some(popup) = app.get_webview_window("popup") else {
        log::warn!("Popup window not found");
        return;
    };

    if popup.is_visible().unwrap_or(false) {
        popup.hide().ok();
    } else {
        // Position the popup below the tray icon area (top-right of screen)
        // On macOS, the menu bar is ~24px tall, position popup just below it
        if let Ok(monitor) = popup.current_monitor() {
            if let Some(monitor) = monitor {
                let screen_width = monitor.size().width as f64 / monitor.scale_factor();
                // Position: right-aligned, below menu bar
                let x = screen_width - 320.0 - 8.0; // 320px width + 8px margin
                let y = 30.0; // below macOS menu bar
                popup
                    .set_position(tauri::LogicalPosition::new(x, y))
                    .ok();
            }
        }
        popup.show().ok();
        popup.set_focus().ok();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(std::sync::Mutex::new(ProxyState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::get_presets,
            commands::set_active_preset,
            commands::create_preset,
            commands::update_preset,
            commands::delete_preset,
            commands::duplicate_preset,
            commands::get_available_models,
            commands::get_model_variants,
            commands::write_file,
            commands::read_file,
            commands::backup_slim_config,
            commands::start_proxy,
            commands::stop_proxy,
            commands::restart_proxy,
            commands::get_proxy_status,
            commands::start_event_stream,
            commands::get_provider_accounts,
            commands::add_provider_account,
            commands::update_api_key,
            commands::delete_provider_account,
            commands::validate_api_key,
            commands::get_version_info,
            commands::get_settings,
            commands::update_settings,
            commands::run_migration_validation_gates,
            commands::show_main_window,
            commands::fetch_usage_stats,
            commands::read_usage_cache,
            commands::write_usage_cache,
            commands::agents::detect_cli_agents,
            commands::agents::configure_cli_agent,
            commands::agents::preview_opencode_config,
            commands::agents::preview_claude_code_config,
            commands::agent_providers::get_agent_providers,
            commands::agent_providers::get_well_known_providers,
            commands::agent_providers::add_agent_provider,
            commands::agent_providers::update_agent_provider,
            commands::agent_providers::delete_agent_provider,
            commands::agent_providers::fetch_provider_models,
            commands::agent_providers::validate_agent_provider_key,
            commands::agent_providers::get_agent_provider_key,
        ])
        .setup(|app| {
            use tauri_plugin_log::{Builder as LogBuilder, Target, TargetKind};
            app.handle().plugin(
                LogBuilder::default()
                    .level(log::LevelFilter::Info)
                    .targets([
                        Target::new(TargetKind::Stdout),
                        Target::new(TargetKind::Webview),
                    ])
                    .build(),
            )?;

            // Register updater plugin (desktop only)
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Build tray icon with click handler to toggle popup
            let handle = app.handle().clone();
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().cloned().expect("no app icon"))
                .icon_as_template(true)
                .tooltip("Aether - AI Proxy Manager")
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_popup(&handle);
                    }
                })
                .build(app)?;

            // Intercept main window close → hide instead (keep alive in tray)
            if let Some(main_window) = app.get_webview_window("main") {
                let main_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        main_clone.hide().ok();
                    }
                });
            }

            // Hide popup when it loses focus (click outside)
            if let Some(popup) = app.get_webview_window("popup") {
                let popup_clone = popup.clone();
                popup.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        popup_clone.hide().ok();
                    }
                });
            }

            // Auto-start proxy if settings file has auto_start_proxy = true
            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let auto_start = check_auto_start_setting();
                if auto_start {
                    let state = handle2.state::<std::sync::Mutex<ProxyState>>();
                    let persistence = crate::core::infrastructure::persistence::SqlitePersistenceAdapter::default();
                    if let Err(e) = persistence.initialize() {
                        log::warn!("Auto-start proxy skipped: failed initializing v2 persistence: {}", e);
                        return;
                    }

                    let runtime_service =
                        crate::core::application::services::proxy_runtime::ProxyRuntimeService::new(
                            persistence,
                        );

                    if let Err(e) = runtime_service.start(&handle2, &state, 8317).await {
                        log::warn!("Auto-start proxy failed: {}", e);
                    }
                }
            });

            // Start config file watcher
            watcher::start_config_watcher(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
