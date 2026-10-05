#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# deskl.ink — container entrypoint (Fedora)
# -----------------------------------------------------------------------------
# Boots a polished KDE Plasma 6 desktop reachable in the browser over noVNC on a
# single port (6080). Identical in behaviour to the Ubuntu image — the ONLY
# distro difference is the VNC wrapper command name: Fedora's tigervnc-server
# ships the Perl wrapper as `vncserver` (Ubuntu calls it `tigervncserver`); the
# flags are the same upstream TigerVNC flags. Flow:
#
#   1. prepare the `desklink` user session (dirs, env, XDG runtime dir)
#   2. start Xvnc on :1  (loopback-only, NO password — see SECURITY below)
#        └─ Xvnc execs ~/.vnc/xstartup which launches the Plasma session
#           (startplasma-x11 under a fresh dbus-run-session; kwin_x11 as WM)
#   3. run websockify in the FOREGROUND as PID 1:
#        serves noVNC's HTML from /usr/share/novnc AND proxies the browser
#        WebSocket to the local VNC server at localhost:5901.
#
#   browser ──wss/https──▶ :6080 websockify ──ws──▶ :5901 Xvnc ──▶ Plasma
#
# SECURITY: the VNC server binds loopback only (-localhost yes) with
# -SecurityTypes None (no VNC password). That is intentional and safe HERE
# because nothing reaches 5901 except websockify inside this container, and the
# ONLY public entrypoint is the deskl.ink Worker, which authenticates every
# connection with a signed ticket and terminates wss before proxying to :6080.
# The container must never be exposed to the internet directly on 6080.
# -----------------------------------------------------------------------------
set -euo pipefail

# ----------------------------- configuration ---------------------------------
# All overridable via `docker run -e NAME=value`. Defaults chosen to "just work".
VNC_RESOLUTION="${VNC_RESOLUTION:-1920x1080}"   # desktop geometry WxH
VNC_DISPLAY="${VNC_DISPLAY:-:1}"                # X display number
VNC_PORT="${VNC_PORT:-5901}"                    # Xvnc RFB port (= 5900 + :1)
NOVNC_PORT="${NOVNC_PORT:-6080}"                # browser-facing websockify port
NOVNC_WEB="${NOVNC_WEB:-/usr/share/novnc}"      # noVNC HTML web root
HOME_DIR="${HOME:-/home/desklink}"
export HOME="${HOME_DIR}"
export DISPLAY="${VNC_DISPLAY}"
export USER="${USER:-desklink}"

# The Fedora TigerVNC wrapper is `vncserver`; fall back to `tigervncserver` so
# this script also works unchanged if a Debian-named wrapper is ever present.
if command -v vncserver >/dev/null 2>&1; then
  VNC_WRAPPER="vncserver"
else
  VNC_WRAPPER="tigervncserver"
fi

# Plasma/KWin need a private XDG runtime dir (0700). No systemd/elogind here to
# create /run/user/<uid>, so provision it up-front; xstartup also ensures it.
XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-desklink}"
export XDG_RUNTIME_DIR
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}"

VNC_DIR="${HOME_DIR}/.vnc"
LOG_PREFIX="[deskl.ink]"

log() { printf '%s %s\n' "${LOG_PREFIX}" "$*"; }

# ----------------------------- session prep ----------------------------------
log "preparing session for user '${USER}' (display ${VNC_DISPLAY}, ${VNC_RESOLUTION})"

mkdir -p "${VNC_DIR}"
chmod 700 "${VNC_DIR}"

# If no xstartup was baked in (defensive — the image ships one), synthesize a
# minimal Plasma launcher so the desktop still comes up.
if [ ! -x "${VNC_DIR}/xstartup" ]; then
  log "no xstartup found — writing a minimal Plasma fallback"
  cat > "${VNC_DIR}/xstartup" <<'EOF'
#!/bin/sh
export DISPLAY="${DISPLAY:-:1}"
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export XDG_RUNTIME_DIR="/tmp/runtime-desklink"
mkdir -p "${XDG_RUNTIME_DIR}"; chmod 700 "${XDG_RUNTIME_DIR}"
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=KDE
export LIBGL_ALWAYS_SOFTWARE=1
command -v xsetroot >/dev/null 2>&1 && xsetroot -solid "#05060A"
if command -v dbus-run-session >/dev/null 2>&1; then
  exec dbus-run-session -- startplasma-x11
else
  eval "$(dbus-launch --sh-syntax)"; export DBUS_SESSION_BUS_ADDRESS
  exec startplasma-x11
fi
EOF
  chmod +x "${VNC_DIR}/xstartup"
fi

# Stale lock/socket from an unclean previous boot would block the display.
rm -f "/tmp/.X11-unix/X${VNC_DISPLAY#:}" "/tmp/.X${VNC_DISPLAY#:}-lock" 2>/dev/null || true
# The vncserver wrapper also tracks state here; clear any stale entry.
rm -f "${VNC_DIR}/"*.pid "${VNC_DIR}/"*.log 2>/dev/null || true

# ----------------------------- shutdown handling -----------------------------
# On SIGTERM/SIGINT, tear the VNC session down cleanly, then stop websockify.
# ── TODO(persistence): before killing the session, snapshot the user's home /
#    desktop state (restic → R2) so a restarted container resumes where it left
#    off. Deferred to a later ROADMAP fire; see README.md § Roadmap. ──
WEBSOCKIFY_PID=""
# shellcheck disable=SC2329  # invoked indirectly via `trap` below
shutdown() {
  log "received shutdown signal — stopping desktop session"
  # Kill the VNC server for this display (ignore if already gone).
  "${VNC_WRAPPER}" -kill "${VNC_DISPLAY}" >/dev/null 2>&1 || true
  if [ -n "${WEBSOCKIFY_PID}" ]; then
    kill -TERM "${WEBSOCKIFY_PID}" 2>/dev/null || true
    wait "${WEBSOCKIFY_PID}" 2>/dev/null || true
  fi
  log "clean shutdown complete"
  exit 0
}
trap shutdown TERM INT

# ----------------------------- start Xvnc ------------------------------------
# Background (daemonized) so websockify can own the foreground. Xvnc reads our
# xstartup, which launches KDE Plasma.
#   -localhost yes        bind 127.0.0.1 only (never on the wire)
#   -SecurityTypes None   no VNC auth (the Worker ticket + wss is the auth layer)
#   -geometry WxH         desktop size
#   -xstartup <file>      our deskl.ink-branded Plasma launcher
#   -depth 24             24-bit color (crisp, standard for noVNC)
#   -verbose              surface startup detail in the server log
log "starting Xvnc on ${VNC_DISPLAY} via '${VNC_WRAPPER}' (loopback-only, no VNC password)"
"${VNC_WRAPPER}" "${VNC_DISPLAY}" \
  -localhost yes \
  -SecurityTypes None \
  -geometry "${VNC_RESOLUTION}" \
  -depth 24 \
  -xstartup "${VNC_DIR}/xstartup" \
  -verbose

# ----------------------------- wait for VNC ----------------------------------
# Make sure the RFB port is accepting connections before fronting it with the
# proxy, so the first browser load doesn't race a not-yet-listening server.
log "waiting for VNC server on localhost:${VNC_PORT}"
for _ in $(seq 1 30); do
  # bash /dev/tcp probe — no extra tooling (nc/ss) needed in the image.
  if (exec 3<>"/dev/tcp/127.0.0.1/${VNC_PORT}") 2>/dev/null; then
    exec 3>&- 2>/dev/null || true
    log "VNC server is up"
    break
  fi
  sleep 1
done

# ----------------------------- start noVNC/websockify ------------------------
# websockify serves the noVNC HTML (so /vnc.html and / both work via the
# index.html symlink) AND bridges the WebSocket to the loopback VNC server.
#
# This is the container's foreground workload: websockify runs as a child and
# this script (PID 1) blocks on `wait`, so the container lives as long as the
# proxy does. We deliberately `wait` on a backgrounded child rather than `exec`
# websockify, because PID 1 must stay in bash to catch SIGTERM and tear the VNC
# session down cleanly (an `exec`'d websockify couldn't run the shutdown trap).
log "starting websockify → http://0.0.0.0:${NOVNC_PORT}/vnc.html (web=${NOVNC_WEB})"
websockify --web="${NOVNC_WEB}" "0.0.0.0:${NOVNC_PORT}" "localhost:${VNC_PORT}" &
WEBSOCKIFY_PID=$!

# Block until websockify exits OR a trapped signal fires. `wait` is interrupted
# by SIGTERM/SIGINT so the trap runs promptly; `|| true` keeps the interrupted
# wait from tripping `set -e`. If websockify dies on its own, fall through and
# exit with its status so the container is restarted.
wait "${WEBSOCKIFY_PID}"
WS_EXIT=$?
log "websockify exited (status ${WS_EXIT})"
exit "${WS_EXIT}"
