#!/usr/bin/env bash
set -euo pipefail

root="${SEARXNG_LOCAL_DIR:-$HOME/dev/searxng-local}"
config_dir="$root/config"
data_dir="$root/data"
image="${SEARXNG_IMAGE:-docker.io/searxng/searxng:latest}"
container="${SEARXNG_CONTAINER_NAME:-searxng-local}"
host="${SEARXNG_HOST:-127.0.0.1}"
port="${SEARXNG_PORT:-8080}"

mkdir -p "$config_dir" "$data_dir"

if [[ ! -f "$root/docker-compose.yml" ]]; then
  cat >"$root/docker-compose.yml" <<YAML
services:
  searxng:
    image: docker.io/searxng/searxng:latest
    container_name: searxng-local
    restart: unless-stopped
    ports:
      - "${host}:${port}:8080"
    volumes:
      - ./config:/etc/searxng
      - ./data:/var/cache/searxng
YAML
fi

if [[ ! -f "$config_dir/settings.yml" ]]; then
  secret="$(openssl rand -hex 32)"
  cat >"$config_dir/settings.yml" <<YAML
use_default_settings: true

general:
  debug: false
  instance_name: "Local SearXNG"

search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json

server:
  secret_key: "$secret"
  limiter: false
  image_proxy: false
YAML
fi

echo "SearXNG local config is ready at $root"

start_searxng() {
  cd "$root"

  if docker compose version >/dev/null 2>&1; then
    docker compose up -d
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d
    return
  fi

  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d \
    --name "$container" \
    --restart unless-stopped \
    -p "$host:$port:8080" \
    -v "$config_dir:/etc/searxng" \
    -v "$data_dir:/var/cache/searxng" \
    "$image"
}

if [[ "${1:-}" == "--start" ]]; then
  start_searxng
else
  echo "Start it with:"
  echo "  $0 --start"
fi
