#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/dist"
TARGET_DIR="${ROOT_DIR}/dist-web"
ASSET_RETENTION_DAYS="${ASSET_RETENTION_DAYS:-7}"

cd "${ROOT_DIR}"

echo "==> Building game client..."
bun run build:client

mkdir -p "${TARGET_DIR}"
source_resolved="$(realpath "${SOURCE_DIR}")"
target_resolved="$(realpath "${TARGET_DIR}")"

if [ "${source_resolved}" != "${ROOT_DIR}/dist" ]; then
  echo "==> Refusing unexpected source path: ${source_resolved}" >&2
  exit 1
fi

if [ "${target_resolved}" != "${ROOT_DIR}/dist-web" ]; then
  echo "==> Refusing unexpected target path: ${target_resolved}" >&2
  exit 1
fi

test -f "${SOURCE_DIR}/index.html"
test -f "${SOURCE_DIR}/version.json"

echo "==> Publishing assets while retaining previous hashed chunks..."
rsync -a \
  --exclude 'index.html' \
  --exclude 'version.json' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

# Publish the entry document and build marker only after every referenced
# asset is available. Existing browser tabs can continue loading old chunks.
install -m 0644 "${SOURCE_DIR}/index.html" "${TARGET_DIR}/index.html.next"
mv -f "${TARGET_DIR}/index.html.next" "${TARGET_DIR}/index.html"
install -m 0644 "${SOURCE_DIR}/version.json" "${TARGET_DIR}/version.json.next"
mv -f "${TARGET_DIR}/version.json.next" "${TARGET_DIR}/version.json"

# Hashed chunks older than the retention window are no longer needed by a
# reasonably current browser tab. Recent prior releases remain available.
find "${TARGET_DIR}/assets" -type f -mtime "+${ASSET_RETENTION_DAYS}" -delete

echo "==> Game client deployed: $(cat "${TARGET_DIR}/version.json")"
