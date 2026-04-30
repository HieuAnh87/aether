#!/usr/bin/env bash
# download-sidecar.sh — Download CLIProxyAPI binary for Tauri sidecar bundling.
#
# Usage:
#   ./scripts/download-sidecar.sh                   # auto-detect current platform
#   ./scripts/download-sidecar.sh --target aarch64-apple-darwin
#   ./scripts/download-sidecar.sh --force            # re-download even if binary exists
#
# Reads version from .cliproxyapi-version in repo root.
# Places binary at src-tauri/binaries/cliproxyapi-{target-triple}

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/.cliproxyapi-version"
BINARIES_DIR="$REPO_ROOT/src-tauri/binaries"
GITHUB_REPO="router-for-me/CLIProxyAPI"

# --- Parse args ---
TARGET=""
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# --- Read pinned version ---
if [[ ! -f "$VERSION_FILE" ]]; then
  echo "ERROR: $VERSION_FILE not found. Create it with a version tag (e.g., v6.9.45)" >&2
  exit 1
fi
VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
echo "CLIProxyAPI version: $VERSION"

# --- Detect or validate target triple ---
detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64) echo "aarch64-apple-darwin" ;;
        x86_64) echo "x86_64-apple-darwin" ;;
        *) echo "Unsupported macOS arch: $arch" >&2; exit 1 ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        aarch64) echo "aarch64-unknown-linux-gnu" ;;
        *) echo "Unsupported Linux arch: $arch" >&2; exit 1 ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "x86_64-pc-windows-msvc"
      ;;
    *)
      echo "Unsupported OS: $os" >&2; exit 1
      ;;
  esac
}

if [[ -z "$TARGET" ]]; then
  TARGET="$(detect_target)"
fi
echo "Target: $TARGET"

# --- Map Rust target triple → CLIProxyAPI asset naming ---
map_target_to_asset() {
  local target="$1"
  local ver_no_v="${VERSION#v}"  # strip leading 'v'

  case "$target" in
    aarch64-apple-darwin)
      echo "CLIProxyAPI_${ver_no_v}_darwin_arm64.tar.gz" ;;
    x86_64-apple-darwin)
      echo "CLIProxyAPI_${ver_no_v}_darwin_amd64.tar.gz" ;;
    x86_64-unknown-linux-gnu)
      echo "CLIProxyAPI_${ver_no_v}_linux_amd64.tar.gz" ;;
    aarch64-unknown-linux-gnu)
      echo "CLIProxyAPI_${ver_no_v}_linux_arm64.tar.gz" ;;
    x86_64-pc-windows-msvc)
      echo "CLIProxyAPI_${ver_no_v}_windows_amd64.zip" ;;
    *)
      echo "No asset mapping for target: $target" >&2; exit 1 ;;
  esac
}

ASSET_NAME="$(map_target_to_asset "$TARGET")"
BINARY_NAME="cliproxyapi-$TARGET"

# Windows binary needs .exe extension
case "$TARGET" in
  *-windows-*) BINARY_NAME="${BINARY_NAME}.exe" ;;
esac

OUTPUT_PATH="$BINARIES_DIR/$BINARY_NAME"

# --- Skip if binary already exists, is not a placeholder, and --force not set ---
is_placeholder() {
  local file="$1"
  [[ ! -f "$file" ]] && return 0  # missing = treat as placeholder
  local size
  size="$(wc -c < "$file" | tr -d ' ')"
  # Placeholder is a tiny shell script (~87 bytes). Real binaries are >1MB.
  [[ "$size" -lt 1024 ]] && return 0
  # Check if it starts with #!/bin/bash (shell script, not real binary)
  head -c 2 "$file" | grep -q '#!' 2>/dev/null && return 0
  return 1
}

if [[ "$FORCE" == false ]] && ! is_placeholder "$OUTPUT_PATH"; then
  echo "Binary already exists at $OUTPUT_PATH ($(wc -c < "$OUTPUT_PATH" | tr -d ' ') bytes). Use --force to re-download."
  exit 0
fi

# --- Download ---
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/$VERSION/$ASSET_NAME"
CHECKSUMS_URL="https://github.com/$GITHUB_REPO/releases/download/$VERSION/checksums.txt"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading $ASSET_NAME..."
curl -fsSL "$DOWNLOAD_URL" -o "$TMPDIR/$ASSET_NAME"
echo "Downloading checksums.txt..."
curl -fsSL "$CHECKSUMS_URL" -o "$TMPDIR/checksums.txt"

# --- Verify checksum ---
EXPECTED_SUM="$(grep "$ASSET_NAME" "$TMPDIR/checksums.txt" | awk '{print $1}')"
if [[ -z "$EXPECTED_SUM" ]]; then
  echo "WARNING: No checksum found for $ASSET_NAME in checksums.txt" >&2
else
  if command -v sha256sum &>/dev/null; then
    ACTUAL_SUM="$(sha256sum "$TMPDIR/$ASSET_NAME" | awk '{print $1}')"
  else
    ACTUAL_SUM="$(shasum -a 256 "$TMPDIR/$ASSET_NAME" | awk '{print $1}')"
  fi

  if [[ "$EXPECTED_SUM" != "$ACTUAL_SUM" ]]; then
    echo "ERROR: Checksum mismatch!" >&2
    echo "  Expected: $EXPECTED_SUM" >&2
    echo "  Actual:   $ACTUAL_SUM" >&2
    exit 1
  fi
  echo "Checksum verified ✓"
fi

# --- Extract ---
echo "Extracting..."
mkdir -p "$BINARIES_DIR"

case "$ASSET_NAME" in
  *.tar.gz)
    tar -xzf "$TMPDIR/$ASSET_NAME" -C "$TMPDIR"
    # Binary inside archive is named 'cli-proxy-api'
    if [[ -f "$TMPDIR/cli-proxy-api" ]]; then
      mv "$TMPDIR/cli-proxy-api" "$OUTPUT_PATH"
    else
      echo "ERROR: cli-proxy-api not found in archive" >&2
      ls -la "$TMPDIR" >&2
      exit 1
    fi
    ;;
  *.zip)
    unzip -o "$TMPDIR/$ASSET_NAME" -d "$TMPDIR" >/dev/null
    if [[ -f "$TMPDIR/cli-proxy-api.exe" ]]; then
      mv "$TMPDIR/cli-proxy-api.exe" "$OUTPUT_PATH"
    elif [[ -f "$TMPDIR/cli-proxy-api" ]]; then
      mv "$TMPDIR/cli-proxy-api" "$OUTPUT_PATH"
    else
      echo "ERROR: cli-proxy-api not found in archive" >&2
      ls -la "$TMPDIR" >&2
      exit 1
    fi
    ;;
esac

# --- Set permissions ---
chmod +x "$OUTPUT_PATH"

# --- Validate magic bytes ---
validate_binary() {
  local file="$1"
  local target="$2"
  local magic
  magic="$(xxd -l 4 -p "$file")"

  case "$target" in
    *-apple-darwin)
      # Mach-O: CFFAEDFE (64-bit LE) or FEEDFACF (64-bit BE) or CAFEBABE (universal)
      if [[ "$magic" != "cffaedfe" && "$magic" != "feedfacf" && "$magic" != "cafebabe" ]]; then
        echo "WARNING: Binary doesn't look like a Mach-O executable (magic: $magic)" >&2
        return 1
      fi
      ;;
    *-linux-*)
      # ELF: 7f454c46
      if [[ "$magic" != "7f454c46" ]]; then
        echo "WARNING: Binary doesn't look like an ELF executable (magic: $magic)" >&2
        return 1
      fi
      ;;
    *-windows-*)
      # PE: 4d5a (MZ)
      local pe_magic
      pe_magic="$(xxd -l 2 -p "$file")"
      if [[ "$pe_magic" != "4d5a" ]]; then
        echo "WARNING: Binary doesn't look like a PE executable (magic: $pe_magic)" >&2
        return 1
      fi
      ;;
  esac
  return 0
}

if validate_binary "$OUTPUT_PATH" "$TARGET"; then
  echo "Binary format validated ✓"
else
  echo "WARNING: Binary format validation failed — binary may be corrupt" >&2
fi

FILESIZE="$(wc -c < "$OUTPUT_PATH" | tr -d ' ')"
echo ""
echo "✅ CLIProxyAPI $VERSION installed successfully"
echo "   Target:   $TARGET"
echo "   Binary:   $OUTPUT_PATH"
echo "   Size:     $FILESIZE bytes"
