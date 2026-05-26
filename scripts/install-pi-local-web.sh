#!/usr/bin/env bash
set -euo pipefail

repo="${PI_LOCAL_WEB_REPO:-$HOME/dev/pi-local-web}"
repo_url="${PI_LOCAL_WEB_REPO_URL:-git@github.com:ThomasFisherSE/pi-local-web.git}"
real_pi="${PI_REAL_BIN:-/usr/bin/pi}"

if [[ ! -d "$repo" ]]; then
  mkdir -p "$(dirname "$repo")"
  git clone "$repo_url" "$repo"
fi

if [[ ! -x "$real_pi" ]]; then
  echo "Pi binary not found or not executable: $real_pi" >&2
  exit 127
fi

"$real_pi" install "$repo"
