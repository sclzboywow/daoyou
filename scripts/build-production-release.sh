#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_ID="${1:-$(git rev-parse --short=8 HEAD)-source}"
RUNTIME_DIR="${RUNTIME_DIR:-/home/ubuntu/daoyou-runtime}"
RELEASES_DIR="$RUNTIME_DIR/releases"
STAGE_DIR="$RELEASES_DIR/.staging-$RELEASE_ID"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
BUILD_ENV_FILE="${BUILD_ENV_FILE:-$RUNTIME_DIR/app.env}"
IMAGE_TAG="${IMAGE_TAG:-daoyou-hono:source-$RELEASE_ID}"

if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid release id: $RELEASE_ID" >&2
  exit 1
fi

test -f "$BUILD_ENV_FILE"
test ! -e "$STAGE_DIR"
test ! -e "$RELEASE_DIR"
mkdir -p "$STAGE_DIR/web" "$STAGE_DIR/server"

read_build_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$BUILD_ENV_FILE"
}

export VITE_API_BASE_URL="$(read_build_env VITE_API_BASE_URL)"
export VITE_TURNSTILE_SITE_KEY="$(read_build_env VITE_TURNSTILE_SITE_KEY)"
export CF_PAGES_COMMIT_SHA="$RELEASE_ID"

echo "==> Installing locked dependencies"
bun install --frozen-lockfile

echo "==> Running lint"
bun run lint

echo "==> Building and freezing client assets"
bun run build:client
test -f dist/index.html
test -f dist/version.json
test -f dist/favicon.svg
test -f dist/manifest.webmanifest
test -f dist/icons/icon-192.png
test -d dist/assets
cp -a dist/. "$STAGE_DIR/web/"

echo "==> Building server without replacing the client output"
bun run build:server
test -f dist/index.js
test -f dist/index.html
test -f dist/version.json
cp -a dist/. "$STAGE_DIR/server/"

test -f "$STAGE_DIR/web/index.html"
test ! -f "$STAGE_DIR/web/index.js"
test -f "$STAGE_DIR/server/index.js"

echo "==> Building runtime image: $IMAGE_TAG"
docker build \
  -f deploy/production/Dockerfile.runtime \
  -t "$IMAGE_TAG" \
  "$STAGE_DIR/server"

COMMIT_SHA="$(git rev-parse HEAD)" \
RELEASE_ID="$RELEASE_ID" \
IMAGE_TAG="$IMAGE_TAG" \
MANIFEST_FILE="$STAGE_DIR/release.json" \
  bun -e '
    const manifest = {
      releaseId: process.env.RELEASE_ID,
      commit: process.env.COMMIT_SHA,
      image: process.env.IMAGE_TAG,
      builtAt: new Date().toISOString(),
    };
    await Bun.write(process.env.MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  '

(
  cd "$STAGE_DIR"
  sha256sum web/index.html server/index.js > SHA256SUMS
)

mv "$STAGE_DIR" "$RELEASE_DIR"

echo "==> Source release ready"
echo "release=$RELEASE_ID"
echo "image=$IMAGE_TAG"
echo "path=$RELEASE_DIR"
