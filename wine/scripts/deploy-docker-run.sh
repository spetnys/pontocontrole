#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Arquivo .env nao encontrado em $ROOT_DIR" >&2
  exit 1
fi

set -a
. "$ROOT_DIR/.env"
set +a

: "${POSTGRES_DB:=ponto_controle}"
: "${POSTGRES_USER:=ponto_controle}"
: "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env}"
: "${SITE_URL:=https://adegaweb.com.br}"

docker network inspect adegaweb_net >/dev/null 2>&1 || docker network create adegaweb_net
docker volume inspect adegaweb_ponto_controle_postgres >/dev/null 2>&1 || docker volume create adegaweb_ponto_controle_postgres
docker volume inspect adegaweb_ponto_controle_data >/dev/null 2>&1 || docker volume create adegaweb_ponto_controle_data
docker volume inspect adegaweb_caddy_data >/dev/null 2>&1 || docker volume create adegaweb_caddy_data
docker volume inspect adegaweb_caddy_config >/dev/null 2>&1 || docker volume create adegaweb_caddy_config

docker build -t adegaweb-ponto-controle:latest .

docker rm -f ponto-controle-db >/dev/null 2>&1 || true
docker run -d --name ponto-controle-db --restart unless-stopped \
  --network adegaweb_net --network-alias db --env-file .env \
  -v adegaweb_ponto_controle_postgres:/var/lib/postgresql/data \
  postgres:16-alpine

docker rm -f ponto-controle-app >/dev/null 2>&1 || true
docker run -d --name ponto-controle-app --restart unless-stopped \
  --network adegaweb_net --network-alias app --env-file .env \
  -e DATA_DIR=/data -e PORT=3000 -e SITE_URL="$SITE_URL" \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  -v adegaweb_ponto_controle_data:/data \
  adegaweb-ponto-controle:latest

docker rm -f adegaweb >/dev/null 2>&1 || true
docker run -d --name adegaweb --restart unless-stopped \
  --network adegaweb_net -p 80:80 -p 443:443 \
  -v "$ROOT_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v adegaweb_caddy_data:/data \
  -v adegaweb_caddy_config:/config \
  caddy:2-alpine

echo "Deploy concluido. Validar com:"
echo "curl -fsS ${SITE_URL}/api/health"
