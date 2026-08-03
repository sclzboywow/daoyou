#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${DAOYOU_BACKUP_DIR:-/home/ubuntu/backups/daoyou/postgres}"
RETENTION_DAYS="${DAOYOU_BACKUP_RETENTION_DAYS:-14}"
POSTGRES_CONTAINER="${DAOYOU_POSTGRES_CONTAINER:-daoyou-postgres}"
RCLONE_REMOTE="${DAOYOU_BACKUP_RCLONE_REMOTE:-}"

case "${BACKUP_DIR}" in
  /home/ubuntu/backups/daoyou/postgres|/home/ubuntu/backups/daoyou/postgres/*) ;;
  *)
    echo "Refusing unexpected backup directory: ${BACKUP_DIR}" >&2
    exit 1
    ;;
esac

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [ "${RETENTION_DAYS}" -lt 1 ]; then
  echo "DAOYOU_BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

install -d -m 700 "${BACKUP_DIR}"
exec 9>"${BACKUP_DIR}/.backup.lock"
if ! flock -n 9; then
  echo "Another PostgreSQL backup is already running"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="daoyou-${timestamp}.dump"
temporary="${BACKUP_DIR}/.${filename}.part"
backup="${BACKUP_DIR}/${filename}"
checksum="${backup}.sha256"

cleanup() {
  rm -f -- "${temporary}"
}
trap cleanup EXIT

docker exec "${POSTGRES_CONTAINER}" sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --compress=9 --no-owner --no-privileges' \
  > "${temporary}"

if [ ! -s "${temporary}" ]; then
  echo "Backup is empty" >&2
  exit 1
fi

docker exec -i "${POSTGRES_CONTAINER}" pg_restore --list \
  < "${temporary}" >/dev/null
chmod 600 "${temporary}"
mv -- "${temporary}" "${backup}"
(
  cd "${BACKUP_DIR}"
  sha256sum "${filename}" > "${filename}.sha256"
)

if [ -n "${RCLONE_REMOTE}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "DAOYOU_BACKUP_RCLONE_REMOTE is set but rclone is unavailable" >&2
    exit 1
  fi
  rclone copyto "${backup}" "${RCLONE_REMOTE%/}/${filename}"
  rclone copyto "${checksum}" "${RCLONE_REMOTE%/}/${filename}.sha256"
fi

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'daoyou-*.dump' -o -name 'daoyou-*.dump.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Backup completed: ${backup}"
