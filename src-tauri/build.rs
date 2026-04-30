use std::path::PathBuf;

fn main() {
    // --- Validate sidecar binary exists and is not a placeholder ---
    let target_triple =
        std::env::var("TARGET").unwrap_or_else(|_| guess_target_triple());

    let binary_name = if target_triple.contains("windows") {
        format!("cliproxyapi-{}.exe", target_triple)
    } else {
        format!("cliproxyapi-{}", target_triple)
    };

    let binary_path = PathBuf::from("binaries").join(&binary_name);

    if !binary_path.exists() {
        panic!(
            "\n\n\
            ╔══════════════════════════════════════════════════════════╗\n\
            ║  CLIProxyAPI sidecar binary not found!                  ║\n\
            ║                                                        ║\n\
            ║  Expected: {}  ║\n\
            ║                                                        ║\n\
            ║  Run:  ./scripts/download-sidecar.sh                   ║\n\
            ╚══════════════════════════════════════════════════════════╝\n\n",
            binary_path.display()
        );
    }

    // Check if it's a placeholder (tiny shell script)
    let metadata = std::fs::metadata(&binary_path)
        .unwrap_or_else(|e| panic!("Cannot read binary metadata: {}", e));

    if metadata.len() < 1024 {
        // Likely the placeholder script. Warn but don't fail in dev mode.
        let profile = std::env::var("PROFILE").unwrap_or_default();
        if profile == "release" {
            panic!(
                "\n\n\
                ╔══════════════════════════════════════════════════════════╗\n\
                ║  CLIProxyAPI binary is a placeholder ({:>5} bytes)!      ║\n\
                ║  Release builds require a real binary.                  ║\n\
                ║                                                        ║\n\
                ║  Run:  ./scripts/download-sidecar.sh                   ║\n\
                ╚══════════════════════════════════════════════════════════╝\n\n",
                metadata.len()
            );
        } else {
            println!(
                "cargo:warning=CLIProxyAPI binary at {} is a placeholder ({} bytes). \
                 Run ./scripts/download-sidecar.sh to download the real binary.",
                binary_path.display(),
                metadata.len()
            );
        }
    }

    // --- Expose sidecar version as compile-time env var ---
    let version_file = PathBuf::from("../.cliproxyapi-version");
    let sidecar_version = if version_file.exists() {
        std::fs::read_to_string(&version_file)
            .unwrap_or_else(|_| "unknown".to_string())
            .trim()
            .to_string()
    } else {
        "unknown".to_string()
    };
    println!("cargo:rustc-env=BUNDLED_SIDECAR_VERSION={}", sidecar_version);

    // Re-run build script if the binary or version file changes
    println!("cargo:rerun-if-changed=binaries/{}", binary_name);
    println!("cargo:rerun-if-changed=../.cliproxyapi-version");
    println!("cargo:rerun-if-changed=../scripts/download-sidecar.sh");

    // Re-run if icons change (so dock icon is re-embedded)
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    tauri_build::build()
}

/// Best-effort guess of the Rust target triple from environment.
fn guess_target_triple() -> String {
    let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    match (arch.as_str(), os.as_str(), env.as_str()) {
        ("aarch64", "macos", _) => "aarch64-apple-darwin".to_string(),
        ("x86_64", "macos", _) => "x86_64-apple-darwin".to_string(),
        ("x86_64", "linux", "gnu") => "x86_64-unknown-linux-gnu".to_string(),
        ("aarch64", "linux", "gnu") => "aarch64-unknown-linux-gnu".to_string(),
        ("x86_64", "windows", "msvc") => "x86_64-pc-windows-msvc".to_string(),
        _ => {
            println!(
                "cargo:warning=Unknown target triple: arch={}, os={}, env={}. \
                 Falling back to aarch64-apple-darwin.",
                arch, os, env
            );
            "aarch64-apple-darwin".to_string()
        }
    }
}
