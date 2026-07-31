#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${DAOYOU_BACKUP_DIR:-/home/ubuntu/backups/daoyou/postgres}"
POSTGRES_CONTAINER="${DAOYOU_POSTGRES_CONTAINER:-daoyou-postgres}"
POSTGRES_USER="${DAOYOU_POSTGRES_USER:-daoyou}"
backup="${1:-}"

if [ -z "${backup}" ]; then
  backup="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'daoyou-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
fi

case "${backup}" in
  "${BACKUP_DIR}"/daoyou-*.dump) ;;
  *)
    echo "Backup must be a dump inside ${BACKUP_DIR}" >&2
    exit 1
    ;;
esac

if [ ! -s "${backup}" ]; then
  echo "Backup not found or empty: ${backup}" >&2
  exit 1
fi

checksum="${backup}.sha256"
if [ -f "${checksum}" ]; then
  (
    cd "${BACKUP_DIR}"
    sha256sum --check "$(basename "${checksum}")"
  )
fi

verify_db="daoyou_restore_verify_$(date -u +%Y%m%d%H%M%S)"
cleanup() {
  docker exec "${POSTGRES_CONTAINER}" \
    dropdb --username="${POSTGRES_USER}" --if-exists "${verify_db}" >/dev/null
}
trap cleanup EXIT

docker exec "${POSTGRES_CONTAINER}" \
  createdb --username="${POSTGRES_USER}" "${verify_db}"
docker exec -i "${POSTGRES_CONTAINER}" \
  pg_restore \
  --username="${POSTGRES_USER}" \
  --dbname="${verify_db}" \
  --no-owner \
  --no-privileges < "${backup}"

table_count="$(
  docker exec "${POSTGRES_CONTAINER}" \
    psql \
    --username="${POSTGRES_USER}" \
    --dbname="${verify_db}" \
    --tuples-only \
    --no-align \
    --command="select count(*) from information_schema.tables where table_schema in ('public', 'better_auth');"
)"

if [ "${table_count}" -lt 1 ]; then
  echo "Restore verification found no application tables" >&2
  exit 1
fi

echo "Restore verification completed: ${table_count} tables"
