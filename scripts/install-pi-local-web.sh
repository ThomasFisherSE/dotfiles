#!/usr/bin/env bash
set -euo pipefail

repo="${PI_LOCAL_WEB_REPO:-$HOME/dev/pi-local-web}"
real_pi="${PI_REAL_BIN:-/usr/bin/pi}"

if [[ ! -d "$repo" ]]; then
  cat >&2 <<EOF
pi-local-web checkout not found:
  $repo

Set PI_LOCAL_WEB_REPO=/path/to/pi-local-web or clone/create it there first.
EOF
  exit 1
fi

if [[ ! -x "$real_pi" ]]; then
  echo "Pi binary not found or not executable: $real_pi" >&2
  exit 127
fi

"$real_pi" install "$repo"
