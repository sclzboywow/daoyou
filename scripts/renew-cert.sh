#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/daoyou
docker run --rm \
  -v /home/ubuntu/daoyou/certbot/www:/var/www/certbot \
  -v /home/ubuntu/daoyou/certbot/conf:/etc/letsencrypt \
  docker.m.daocloud.io/certbot/certbot:latest renew --webroot -w /var/www/certbot
docker exec daoyou-web nginx -s reload || docker compose --env-file .env.compose -f docker-compose.selfhost.yml restart web
