# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — browser-delivered Ubuntu desktop (noVNC → TigerVNC → XFCE)
# -----------------------------------------------------------------------------
# A lean linux/amd64 Ubuntu 24.04 (noble) image that boots straight into a
# lightweight graphical Linux desktop reachable in the browser over noVNC.
#
# Topology (see README.md for the full diagram):
#   browser ──wss/https──▶ :6080 websockify ──ws──▶ :5901 Xtigervnc ──▶ XFCE (:1)
#
# websockify serves the noVNC HTML *and* proxies the WebSocket to the local
# VNC server, so the single exposed port is 6080. This is what Cloudflare
# Containers runs; the deskl.ink Worker proxies /vnc/* to port 6080 and is the
# layer that authenticates (signed ticket + wss) — the VNC server itself runs
# loopback-only with NO over-the-wire password (see start.sh for the rationale).
#
# Build (no daemon is assumed in CI authoring — build locally):
#   docker build --platform linux/amd64 -t deskl-ubuntu .
#   docker run -p 6080:6080 deskl-ubuntu   # → http://localhost:6080/vnc.html
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 ubuntu:24.04

# OCI metadata — helps registries/Cloudflare surface what this image is.
LABEL org.opencontainers.image.title="deskl.ink Ubuntu desktop" \
      org.opencontainers.image.description="Ubuntu 24.04 XFCE desktop over noVNC on :6080" \
      org.opencontainers.image.source="https://deskl.ink" \
      org.opencontainers.image.vendor="deskl.ink"

# Non-interactive apt; stable, predictable locale/tz for the desktop session.
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DISPLAY=:1

# -----------------------------------------------------------------------------
# System packages — ONE layer: update → install --no-install-recommends → clean.
# Package names verified against Ubuntu 24.04 (noble), 2026-10:
#   xfce4, xfce4-terminal ............ lightweight polished DE (justified in README)
#   tigervnc-standalone-server ....... Xtigervnc X server (universe, enabled by default)
#   tigervnc-common .................. shared TigerVNC files (pulled in anyway; explicit)
#   novnc ............................ HTML5 VNC client → /usr/share/novnc (ships vnc.html)
#   python3-websockify ............... provides /usr/bin/websockify (the "websockify" pkg)
#   python3-numpy .................... websockify HyBi fast-path (quietly recommended)
#   dbus-x11 ......................... dbus-launch — XFCE session needs a session bus
#   x11-xserver-utils ................ xsetroot/xset (root-window color, screensaver off)
#   git curl ca-certificates nano .... minimal in-desktop basics ONLY (stay LEAN)
#
# NOTE: the "batteries" (Install Doctor profile + Superset + the broader app
# superset) are a LATER ROADMAP fire — deliberately NOT installed here to keep
# the base image lean and usable on a 4 GiB container. See README.md § Roadmap.
# -----------------------------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      xfce4 \
      xfce4-terminal \
      tigervnc-standalone-server \
      tigervnc-common \
      novnc \
      python3-websockify \
      python3-numpy \
      dbus-x11 \
      x11-xserver-utils \
      git \
      curl \
      ca-certificates \
      nano \
      sudo \
 && rm -rf /var/lib/apt/lists/*

# noVNC's default landing page is vnc.html; symlink index.html → vnc.html so the
# bare path (http://host:6080/) also loads the client. /vnc.html already works.
RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# -----------------------------------------------------------------------------
# Non-root desktop user `desklink` with passwordless sudo (NOPASSWD so the
# in-container shell can admin the box without a password the user never set).
# -----------------------------------------------------------------------------
RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG sudo desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

# Entry + session scripts. Copied as root, made executable, owned by desklink so
# the user can edit its own session config at runtime.
COPY start.sh /usr/local/bin/start.sh
COPY xstartup /home/desklink/.vnc/xstartup
RUN chmod +x /usr/local/bin/start.sh /home/desklink/.vnc/xstartup \
 && chown -R desklink:desklink /home/desklink/.vnc

# Runtime knobs (overridable at `docker run -e ...`):
#   VNC_RESOLUTION — desktop geometry (WxH). 1920x1080 is a sane browser default.
#   VNC_DISPLAY / VNC_PORT / NOVNC_PORT — wiring; rarely need changing.
ENV HOME=/home/desklink \
    USER=desklink \
    VNC_RESOLUTION=1920x1080 \
    VNC_DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080

# The browser-facing port websockify listens on (noVNC HTML + WS proxy).
EXPOSE 6080

# Drop to the unprivileged desktop user; the entrypoint runs the whole session.
USER desklink
WORKDIR /home/desklink

# start.sh launches VNC + XFCE and then execs websockify in the FOREGROUND as
# PID 1, so the container lifecycle tracks the proxy and SIGTERM shuts cleanly.
ENTRYPOINT ["/usr/local/bin/start.sh"]
