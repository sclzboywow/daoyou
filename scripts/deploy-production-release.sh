#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <release-id>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_ID="$1"
RUNTIME_DIR="${RUNTIME_DIR:-/home/ubuntu/daoyou-runtime}"
RELEASE_DIR="$RUNTIME_DIR/releases/$RELEASE_ID"
COMPOSE="$RUNTIME_DIR/docker-compose.official-runtime.yml"
NGINX="$RUNTIME_DIR/nginx/nginx.conf"
RELEASE_ENV="$RUNTIME_DIR/release.env"
APP_ENV="$RUNTIME_DIR/app.env"
WEB_ROOT=/home/ubuntu/daoyou/dist-web
SITE_ROOT=/home/ubuntu/daoyou/dist-site
WEB_STAGE="/home/ubuntu/daoyou/dist-web.next-$RELEASE_ID"
WEB_BACKUP="/home/ubuntu/daoyou/dist-web.pre-$RELEASE_ID"
BACKUP_FILE="$RUNTIME_DIR/backups/pre-$RELEASE_ID.dump"
PREFLIGHT_CONTAINER="daoyou-preflight-$RELEASE_ID"
DEPLOY_BACKUP_RETENTION_COUNT="${DAOYOU_DEPLOY_BACKUP_RETENTION_COUNT:-3}"

if [[ ! "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid release id: $RELEASE_ID" >&2
  exit 1
fi

if ! [[ "$DEPLOY_BACKUP_RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "DAOYOU_DEPLOY_BACKUP_RETENTION_COUNT must be a positive integer" >&2
  exit 1
fi

test -f "$RELEASE_DIR/release.json"
test -f "$RELEASE_DIR/SHA256SUMS"
test -f "$RELEASE_DIR/web/index.html"
test -f "$RELEASE_DIR/web/version.json"
test -f "$RELEASE_DIR/web/icons/icon-192.png"
test ! -f "$RELEASE_DIR/web/index.js"
test -f "$RELEASE_DIR/server/index.js"
test -f "$SITE_ROOT/index.html"
test -f "$APP_ENV"
test -f "$RUNTIME_DIR/nats/nats.conf"
test -d "$WEB_ROOT"
test ! -e "$WEB_STAGE"
test ! -e "$WEB_BACKUP"
test ! -e "$BACKUP_FILE"

(
  cd "$RELEASE_DIR"
  sha256sum -c SHA256SUMS
)

IMAGE_TAG="$(
  MANIFEST="$RELEASE_DIR/release.json" \
    bun -e 'const manifest = await Bun.file(process.env.MANIFEST).json(); process.stdout.write(manifest.image)'
)"
RELEASE_COMMIT="$(
  MANIFEST="$RELEASE_DIR/release.json" \
    bun -e 'const manifest = await Bun.file(process.env.MANIFEST).json(); process.stdout.write(manifest.commit)'
)"

test "$RELEASE_COMMIT" = "$(git rev-parse HEAD)"
docker image inspect "$IMAGE_TAG" >/dev/null

CURRENT_IMAGE="$(docker inspect --format '{{.Config.Image}}' daoyou-hono)"
DAOYOU_APP_IMAGE="$CURRENT_IMAGE" docker compose \
  -f deploy/production/docker-compose.yml up -d nats

for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' daoyou-nats 2>/dev/null || true)" = healthy ]; then
    break
  fi
  sleep 1
done
test "$(docker inspect --format '{{.State.Health.Status}}' daoyou-nats)" = healthy

install -d -m 700 "$RUNTIME_DIR/backups"
docker exec daoyou-postgres sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"
test -s "$BACKUP_FILE"

APP_DB_URL="$({
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' daoyou-hono
} | sed -n 's/^DATABASE_URL=//p')"
DB_HOST="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' daoyou-postgres)"
HOST_DB_URL="$(
  SOURCE_DB_URL="$APP_DB_URL" TARGET_HOST="$DB_HOST" \
    bun -e 'const url = new URL(process.env.SOURCE_DB_URL); url.hostname = process.env.TARGET_HOST; process.stdout.write(url.toString())'
)"

DATABASE_URL="$HOST_DB_URL" bunx drizzle-kit migrate --config drizzle.config.ts

test -z "$(docker ps -aq --filter name="^${PREFLIGHT_CONTAINER}$")"
docker run --rm -d \
  --name "$PREFLIGHT_CONTAINER" \
  --env-file "$APP_ENV" \
  --network daoyou_default \
  "$IMAGE_TAG" >/dev/null

stop_preflight() {
  docker stop "$PREFLIGHT_CONTAINER" >/dev/null 2>&1 || true
}
trap stop_preflight EXIT

for _ in $(seq 1 30); do
  if docker exec "$PREFLIGHT_CONTAINER" bun -e \
    "fetch('http://127.0.0.1:3000/api/health-check').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    break
  fi
  sleep 1
done
docker exec "$PREFLIGHT_CONTAINER" bun -e \
  "fetch('http://127.0.0.1:3000/api/health-check').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
stop_preflight
trap - EXIT

cp -a "$RELEASE_DIR/web" "$WEB_STAGE"

# Keep hashed chunks from the currently deployed client. Browsers with an open
# session may request a lazy chunk from the previous release after the switch.
# Hashed filenames are content-addressed, so copying without overwriting is safe.
if [ -d "$WEB_ROOT/assets" ]; then
  mkdir -p "$WEB_STAGE/assets"
  cp -an "$WEB_ROOT/assets/." "$WEB_STAGE/assets/"
fi

if [ ! -f "$RELEASE_ENV" ]; then
  CURRENT_IMAGE="$(docker inspect --format '{{.Config.Image}}' daoyou-hono)"
  printf 'DAOYOU_APP_IMAGE=%s\n' "$CURRENT_IMAGE" > "$RELEASE_ENV"
fi

cp -a "$COMPOSE" "$COMPOSE.pre-$RELEASE_ID"
cp -a "$NGINX" "$NGINX.pre-$RELEASE_ID"
cp -a "$RELEASE_ENV" "$RELEASE_ENV.pre-$RELEASE_ID"

rollback() {
  if [ -d "$WEB_BACKUP" ]; then
    if [ -d "$WEB_ROOT" ]; then
      mv "$WEB_ROOT" "$WEB_STAGE.failed"
    fi
    mv "$WEB_BACKUP" "$WEB_ROOT"
  fi
  cp -a "$COMPOSE.pre-$RELEASE_ID" "$COMPOSE"
  cp -a "$NGINX.pre-$RELEASE_ID" "$NGINX"
  cp -a "$RELEASE_ENV.pre-$RELEASE_ID" "$RELEASE_ENV"
  docker compose --env-file "$RELEASE_ENV" -f "$COMPOSE" \
    up -d --force-recreate nats app web || true
}
trap rollback ERR

cp -a deploy/production/docker-compose.yml "$COMPOSE"
cp -a deploy/production/nginx.conf "$NGINX"
printf 'DAOYOU_APP_IMAGE=%s\n' "$IMAGE_TAG" > "$RELEASE_ENV"

mv "$WEB_ROOT" "$WEB_BACKUP"
mv "$WEB_STAGE" "$WEB_ROOT"

docker compose --env-file "$RELEASE_ENV" -f "$COMPOSE" config >/dev/null
docker compose --env-file "$RELEASE_ENV" -f "$COMPOSE" \
  up -d --force-recreate nats app web

for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' daoyou-hono 2>/dev/null || true)" = healthy ]; then
    break
  fi
  sleep 2
done

test "$(docker inspect --format '{{.State.Health.Status}}' daoyou-hono)" = healthy
docker exec daoyou-web nginx -t
docker exec daoyou-web test -f /usr/share/nginx/html/index.html
docker exec daoyou-web test -f /usr/share/nginx/site/index.html
docker exec daoyou-web test -f /usr/share/nginx/html/icons/icon-192.png
curl -fsS -o /dev/null https://yzdoc.cn/
curl -fsS -o /dev/null https://yzdoc.cn/login
curl -fsS -o /dev/null https://yzdoc.cn/game
curl -fsS -o /dev/null https://yzdoc.cn/icons/icon-192.png
curl -fsS -o /dev/null https://yzdoc.cn/api/health-check

cp -a "$RELEASE_DIR/release.json" "$RUNTIME_DIR/current-release.json"
trap - ERR

mapfile -t expired_deploy_backups < <(
  find "$RUNTIME_DIR/backups" -maxdepth 1 -type f -name 'pre-*.dump' \
    -printf '%T@|%p\n' \
    | sort -t'|' -k1,1nr \
    | tail -n "+$((DEPLOY_BACKUP_RETENTION_COUNT + 1))" \
    | cut -d'|' -f2-
)

for expired_backup in "${expired_deploy_backups[@]}"; do
  case "$expired_backup" in
    "$RUNTIME_DIR/backups/"pre-*.dump)
      rm -f -- "$expired_backup"
      ;;
    *)
      echo "Refusing unexpected deployment backup path: $expired_backup" >&2
      exit 1
      ;;
  esac
done

echo "==> Production release deployed"
echo "release=$RELEASE_ID"
echo "image=$IMAGE_TAG"
echo "backup=$BACKUP_FILE"
