#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-120}"
WAIT_INTERVAL_SECONDS="${WAIT_INTERVAL_SECONDS:-2}"
LOG_TAIL_LINES="${LOG_TAIL_LINES:-200}"

if [ "$#" -gt 0 ]; then
  SERVICES=("$@")
else
  mapfile -t SERVICES < <(docker compose config --services)
fi

if [ "${#SERVICES[@]}" -eq 0 ]; then
  echo "==> No compose services found." >&2
  exit 1
fi

echo "==> Pulling latest images..."
docker compose pull "${SERVICES[@]}"

SERVICES_TO_RECREATE=()

for service in "${SERVICES[@]}"; do
  image_ref="$(docker compose config --images "${service}" | tail -n 1)"
  desired_config_hash="$(docker compose config --hash "${service}" | awk '{print $2}')"

  if [ -z "${image_ref}" ]; then
    echo "==> Unable to resolve image for service: ${service}" >&2
    exit 1
  fi

  desired_image_id="$(docker image inspect --format '{{.Id}}' "${image_ref}")"
  current_container_id="$(docker compose ps -q "${service}" | head -n 1 || true)"

  if [ -z "${current_container_id}" ]; then
    echo "==> ${service}: container not found, will start it"
    SERVICES_TO_RECREATE+=("${service}")
    continue
  fi

  current_image_id="$(docker inspect --format '{{.Image}}' "${current_container_id}")"
  current_config_hash="$(
    docker inspect \
      --format '{{ index .Config.Labels "com.docker.compose.config-hash" }}' \
      "${current_container_id}"
  )"

  if [ "${current_config_hash}" != "${desired_config_hash}" ]; then
    echo "==> ${service}: compose config changed, will recreate it"
    SERVICES_TO_RECREATE+=("${service}")
    continue
  fi

  if [ "${current_image_id}" = "${desired_image_id}" ]; then
    echo "==> ${service}: already using the latest image, skip recreate"
    continue
  fi

  echo "==> ${service}: new image detected, will recreate it"
  SERVICES_TO_RECREATE+=("${service}")
done

if [ "${#SERVICES_TO_RECREATE[@]}" -eq 0 ]; then
  echo "==> All target services already use the latest images."
  exit 0
fi

echo "==> Recreating services: ${SERVICES_TO_RECREATE[*]}"
docker compose up -d --pull never "${SERVICES_TO_RECREATE[@]}"

for service in "${SERVICES_TO_RECREATE[@]}"; do
  container_id="$(docker compose ps -q "${service}" | head -n 1 || true)"

  if [ -z "${container_id}" ]; then
    echo "==> Failed to find container for service: ${service}" >&2
    exit 1
  fi

  echo "==> Waiting for ${service} to become ready..."
  elapsed=0

  while [ "${elapsed}" -lt "${WAIT_TIMEOUT_SECONDS}" ]; do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${container_id}"
    )"

    case "${status}" in
      healthy|running)
        echo "==> ${service} is ${status}"
        break
        ;;
      unhealthy|exited|dead)
        echo "==> ${service} failed with status: ${status}" >&2
        docker compose logs --tail "${LOG_TAIL_LINES}" "${service}" || true
        exit 1
        ;;
    esac

    sleep "${WAIT_INTERVAL_SECONDS}"
    elapsed=$((elapsed + WAIT_INTERVAL_SECONDS))
  done

  if [ "${elapsed}" -ge "${WAIT_TIMEOUT_SECONDS}" ]; then
    echo "==> ${service} was not ready within ${WAIT_TIMEOUT_SECONDS}s" >&2
    docker compose logs --tail "${LOG_TAIL_LINES}" "${service}" || true
    exit 1
  fi
done

echo "==> Deployment finished."
docker compose ps "${SERVICES_TO_RECREATE[@]}"
