#!/usr/bin/env bash
# Installs next-departure's standalone server as a LaunchDaemon, so the e-ink
# display doesn't go blank after a reboot — it previously only started via a
# GUI Login Item, which broke as soon as auto-login was turned off on this Mac
# mini for unrelated testing. Idempotent.
set -euo pipefail

SERVICE_USER="${SERVICE_USER:-$(id -un)}"
SERVICE_HOME="${SERVICE_HOME:-$HOME}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

reachable() { curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; }

# Idempotent short-circuit: if an admin already ran the sudo step below (from
# a previous invocation), re-running this as the (still non-admin) service
# account should just confirm success — not repeat instructions for a step
# that's already done.
if reachable; then
  echo "==> next-departure already reachable at http://127.0.0.1:3000 — nothing to do"
  exit 0
fi

if [ ! -f "$REPO/.env.local" ]; then
  echo "!! $REPO/.env.local not found — copy .env.example there and fill in" >&2
  echo "   PTV_DEV_ID / PTV_API_KEY / TFNSW_API_KEY, then re-run this script." >&2
  exit 1
fi
chmod 600 "$REPO/.env.local"

if [ ! -f "$REPO/.next/standalone/server.js" ]; then
  echo "!! no production build found — run: npm run build" >&2
  exit 1
fi

mkdir -p "$REPO/logs"
chmod +x "$REPO/scripts/start-server.sh"

DEST="/Library/LaunchDaemons/com.astondean.next-departure.plist"
RENDERED="/tmp/com.astondean.next-departure.plist"
sed -e "s|@REPO@|$REPO|g" -e "s|@SERVICE_USER@|$SERVICE_USER|g" -e "s|@SERVICE_HOME@|$SERVICE_HOME|g" \
    "$REPO/deploy/com.astondean.next-departure.plist.template" > "$RENDERED"

# A deliberately non-admin service account can't sudo — that's the point of
# using one. `sudo -v` just probes whether *this* account can, without the
# noisy "not in the sudoers file" rejection if it can't.
if sudo -v 2>/dev/null; then
  echo "==> installing launchd daemon"
  sudo cp "$RENDERED" "$DEST"
  sudo launchctl unload "$DEST" 2>/dev/null || true
  sudo launchctl load "$DEST"
else
  cat <<EOF

==> $SERVICE_USER can't sudo (expected, for a non-admin service account).
    Rendered the plist to $RENDERED. From an admin account on this same
    machine (su <admin-user>, or Screen Sharing — no need to cd anywhere),
    run:

      sudo cp $RENDERED $DEST
      sudo launchctl unload $DEST 2>/dev/null; sudo launchctl load $DEST

    Then re-run this script as $SERVICE_USER to verify it came up.
EOF
  exit 0
fi

echo "==> waiting for the server to come up"
for _ in $(seq 1 30); do
  reachable && break
  sleep 1
done

if reachable; then
  echo "==> next-departure reachable at http://127.0.0.1:3000"
else
  echo "!! not reachable yet — check $REPO/logs/next-departure.{out,err}.log"
fi
