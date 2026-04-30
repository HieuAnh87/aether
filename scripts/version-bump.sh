#!/usr/bin/env bash
# version-bump.sh — Sync version across package.json, tauri.conf.json, and Cargo.toml.
#
# Usage:
#   ./scripts/version-bump.sh 0.2.0
#   ./scripts/version-bump.sh 1.0.0-beta.1

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate version format (semver-ish)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: Invalid version format '$VERSION'. Expected semver (e.g., 0.2.0 or 1.0.0-beta.1)"
  exit 1
fi

echo "Bumping version to $VERSION..."

# 1. package.json
PACKAGE_JSON="$REPO_ROOT/package.json"
if [ -f "$PACKAGE_JSON" ]; then
  # Use node for reliable JSON editing
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  ✓ package.json → $VERSION"
else
  echo "  ⚠ package.json not found"
fi

# 2. tauri.conf.json
TAURI_CONF="$REPO_ROOT/src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF" ]; then
  node -e "
    const fs = require('fs');
    const conf = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
    conf.version = '$VERSION';
    fs.writeFileSync('$TAURI_CONF', JSON.stringify(conf, null, 2) + '\n');
  "
  echo "  ✓ tauri.conf.json → $VERSION"
else
  echo "  ⚠ tauri.conf.json not found"
fi

# 3. Cargo.toml — use node for reliable first-occurrence replacement
CARGO_TOML="$REPO_ROOT/src-tauri/Cargo.toml"
if [ -f "$CARGO_TOML" ]; then
  node -e "
    const fs = require('fs');
    let content = fs.readFileSync('$CARGO_TOML', 'utf8');
    // Replace only the first 'version = \"...\"' (under [package])
    content = content.replace(/^version = \"[^\"]*\"/m, 'version = \"$VERSION\"');
    fs.writeFileSync('$CARGO_TOML', content);
  "
  echo "  ✓ Cargo.toml → $VERSION"
else
  echo "  ⚠ Cargo.toml not found"
fi

echo ""
echo "Version bumped to $VERSION in all files."
echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'chore: bump version to $VERSION'"
echo "  git tag v$VERSION"
echo "  git push && git push --tags"
