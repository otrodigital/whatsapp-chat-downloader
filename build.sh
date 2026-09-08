#!/usr/bin/env bash
#
# Builds a Chrome Web Store upload package.
#
#   ./build.sh              -> dist/whatsapp-chat-downloader-<version>.zip
#
# Only runtime files are packaged. Tests, tooling, docs and the console
# diagnostic stay out of the upload so reviewers see the smallest possible
# surface.
set -euo pipefail

cd "$(dirname "$0")"

RUNTIME_FILES=(manifest.json background.js content.js popup.html popup.js popup.css)
RUNTIME_DIRS=(icons)

echo "==> Validating"
node tools/validate.js
for file in "${RUNTIME_FILES[@]}"; do
  case "$file" in
    *.js) node --check "$file" ;;
  esac
done

if [ -d test/node_modules ]; then
  echo "==> Running tests"
  (cd test && npm test --silent | tail -1)
else
  echo "==> Skipping tests (run: cd test && npm install)"
fi

VERSION=$(node -p "require('./manifest.json').version")
NAME="whatsapp-chat-downloader-${VERSION}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging v${VERSION}"
for file in "${RUNTIME_FILES[@]}"; do cp "$file" "$STAGE/"; done
for dir in "${RUNTIME_DIRS[@]}"; do cp -R "$dir" "$STAGE/"; done

# Strip macOS metadata that would otherwise ride along in the zip.
find "$STAGE" -name '.DS_Store' -delete
xattr -cr "$STAGE" 2>/dev/null || true

mkdir -p dist
rm -f "dist/${NAME}.zip"
(cd "$STAGE" && zip -r -X -q "${OLDPWD}/dist/${NAME}.zip" .)

echo "==> Built dist/${NAME}.zip"
unzip -Z1 "dist/${NAME}.zip" | grep -v '/$' | sed 's/^/    /'
echo "    ------------------------------"
echo "    $(unzip -Z1 "dist/${NAME}.zip" | grep -cv '/$') files, $(du -h "dist/${NAME}.zip" | cut -f1) total"

# The store rejects packages containing these.
if unzip -l "dist/${NAME}.zip" | grep -qE 'node_modules|\.map$|__MACOSX'; then
  echo "ERROR: package contains files the store will reject" >&2
  exit 1
fi
echo "==> Ready to upload"
