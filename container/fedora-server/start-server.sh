#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# deskl.ink — headless server entrypoint
# -----------------------------------------------------------------------------
# The ONLY workload is a browser terminal (ttyd) running an interactive login
# shell as the desklink user, on :7681. No desktop, no VNC. The deskl.ink Worker
# proxies /api/v1/desktops/:id/term/* to this port with the same signed-ticket
# auth as the desktop terminal; the container is never publicly exposed.
#
# ttyd runs in the FOREGROUND as PID 1 so the container lifecycle tracks it and
# SIGTERM tears it down cleanly.
# -----------------------------------------------------------------------------
set -euo pipefail

export HOME="${HOME:-/home/desklink}"
export USER="${USER:-desklink}"
TTYD_PORT="${TTYD_PORT:-7681}"

cd "${HOME}"
# Quiet the default Ubuntu login banner for a clean terminal.
touch "${HOME}/.hushlogin" 2>/dev/null || true

echo "[deskl.ink] headless server — browser terminal on 0.0.0.0:${TTYD_PORT}"

# --writable = interactive shell; bound 0.0.0.0 so the Worker proxy can reach it.
exec ttyd \
  --writable \
  --port "${TTYD_PORT}" \
  --interface 0.0.0.0 \
  --client-option 'fontSize=14' \
  --client-option 'fontFamily=JetBrains Mono, monospace' \
  bash -l
