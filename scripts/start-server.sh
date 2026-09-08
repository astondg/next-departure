#!/usr/bin/env bash
# The actual long-running process launchd supervises (KeepAlive — see
# deploy/com.astondean.next-departure.plist.template). Sources .env.local for
# PTV_DEV_ID / PTV_API_KEY / TFNSW_API_KEY since the standalone Next.js build
# doesn't reliably auto-load it the way `next start` does, then `exec`s node
# so it directly replaces this script's PID (launchd needs to track the real
# server process, not a wrapper shell, for KeepAlive/restart to work right).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

if [ ! -f .env.local ]; then
  echo "!! $REPO/.env.local not found — copy .env.example there and fill in credentials" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

exec node .next/standalone/server.js
