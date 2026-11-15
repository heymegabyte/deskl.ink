# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — browser-delivered Ubuntu desktop (noVNC → TigerVNC → GNOME)
# -----------------------------------------------------------------------------
# A lean linux/amd64 Ubuntu 24.04 (noble) image that boots straight into a
# polished, dark, on-brand GNOME desktop reachable in the browser over noVNC.
# No Linux login screen — the VNC session starts GNOME directly.
#
# Topology (see README.md for the full diagram):
#   browser ──wss/https──▶ :6080 websockify ──ws──▶ :5901 Xtigervnc ──▶ GNOME (:1)
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
LABEL org.opencontainers.image.title="deskl.ink Ubuntu GNOME desktop" \
      org.opencontainers.image.description="Ubuntu 24.04 GNOME desktop over noVNC on :6080" \
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
# Package names verified against Ubuntu 24.04 (noble), 2026-10.
#
#   gnome-session / gnome-shell ... full GNOME X11 session without a login manager
#   gnome-terminal / nautilus ..... terminal and file manager
#   gnome-control-center .......... system settings
#   gnome-settings-daemon ......... desktop settings services
#   adwaita-icon-theme-full ....... complete GNOME icon set
#   firefox ....................... browser inside the desktop (noble apt)
#   dbus-x11 ...................... private D-Bus session for GNOME
#   x11-xserver-utils ............. xsetroot/xset (root-window color, blanking off)
#   fonts-noto fonts-noto-color-emoji  crisp text + emoji (default fonts are thin)
#   tigervnc-standalone-server .... Xtigervnc headless X/VNC server (universe)
#   tigervnc-common ............... tigervncserver wrapper + shared files
#   novnc ......................... HTML5 VNC client → /usr/share/novnc (vnc.html)
#   python3 ....................... stdlib interpreter for the loopback
#                                   backup/restore agent (backup-agent.py). Pulled
#                                   transitively by python3-websockify today;
#                                   explicit so the agent never depends on that.
#   python3-websockify ............ provides /usr/bin/websockify (HTML + WS proxy)
#   python3-numpy ................. websockify HyBi fast-path (lower-CPU WebSocket)
#   git curl ca-certificates nano  minimal in-desktop basics ONLY (stay LEAN)
#   sudo .......................... passwordless sudo for the desklink user
#
# NOTE: the "batteries" (Install Doctor profile + Superset + the broader app
# superset) are a LATER ROADMAP fire — deliberately NOT installed here to keep
# the base image lean and usable on a 4 GiB container. See README.md § Roadmap.
# -----------------------------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gnome-session \
      gnome-shell \
      gnome-terminal \
      nautilus \
      gnome-control-center \
      gnome-settings-daemon \
      adwaita-icon-theme-full \
      firefox \
      dbus-x11 \
      x11-xserver-utils \
      fonts-noto \
      fonts-noto-color-emoji \
      tigervnc-standalone-server \
      tigervnc-common \
      novnc \
      python3 \
      python3-websockify \
      python3-numpy \
      git \
      curl \
      ca-certificates \
      nano \
      sudo \
 && rm -rf /var/lib/apt/lists/*

# noVNC's default landing page is vnc.html; symlink index.html → vnc.html so the
# bare path (http://host:6080/) also loads the client. /vnc.html already works.
RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html
COPY assets/deskl-novnc.css /usr/share/novnc/deskl-novnc.css
RUN sed -i 's#</head>#<link rel="stylesheet" href="deskl-novnc.css"></head>#' /usr/share/novnc/vnc.html \
 && sed -i 's#<title>noVNC</title>#<title>deskl.ink remote desktop</title>#' /usr/share/novnc/vnc.html

# Browser terminal: the ttyd static binary (tsl0922/ttyd, pinned). ttyd serves an
# xterm.js terminal over HTTP+WS on :7681 and is designed for reverse-proxy subpath
# deployment (relative asset + ws paths), so the deskl.ink Worker proxies it under
# /api/v1/desktops/:id/term/* with the SAME signed-ticket auth as VNC. Bound
# loopback-free (0.0.0.0) by start.sh so getTcpPort/containerFetch can reach it;
# the container is never publicly exposed.
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
      -o /usr/local/bin/ttyd \
 && chmod +x /usr/local/bin/ttyd

# -----------------------------------------------------------------------------
# Non-root desktop user `desklink` with passwordless sudo (NOPASSWD so the
# in-container shell can admin the box without a password the user never set).
# -----------------------------------------------------------------------------
RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG sudo desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

# -----------------------------------------------------------------------------
# GNOME uses a near-black wallpaper carrying the exact square mark used by the
# GitHub OAuth app and website. xstartup applies the dark theme and wallpaper on
# first boot; the logo is also installed in the standard application icon path.
# -----------------------------------------------------------------------------
COPY assets/deskl-gnome-wallpaper.png /usr/share/backgrounds/deskl-ink.png
COPY assets/deskl-mark-512.png /usr/share/icons/hicolor/512x512/apps/deskl-ink.png

# Entry + session scripts. Copied as root, made executable, owned by desklink so
# the user can edit its own session config at runtime.
COPY start.sh /usr/local/bin/start.sh
COPY xstartup /home/desklink/.vnc/xstartup

# Backup/restore agent (started in the background by start.sh). System location
# next to start.sh; binds 0.0.0.0 so the DO can reach it via the Container
# runtime's getTcpPort/containerFetch (a 127.0.0.1 bind is unreachable from there,
# same as ttyd). Port 7070 is deliberately NOT in EXPOSE — DO-only, NEVER public.
COPY backup-agent.py /usr/local/bin/backup-agent.py

RUN chmod +x /usr/local/bin/start.sh /home/desklink/.vnc/xstartup /usr/local/bin/backup-agent.py \
 && mkdir -p /home/desklink/.vnc /home/desklink/.config /home/desklink/.cache /home/desklink/.local/share \
 && chown -R desklink:desklink /home/desklink/.vnc /home/desklink/.config /home/desklink/.cache /home/desklink/.local

# Runtime knobs (overridable at `docker run -e ...`):
#   VNC_RESOLUTION — desktop geometry (WxH). 1920x1080 is a sane browser default.
#   VNC_DISPLAY / VNC_PORT / NOVNC_PORT — wiring; rarely need changing.
ENV HOME=/home/desklink \
    USER=desklink \
    VNC_RESOLUTION=1920x1080 \
    VNC_DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080 \
    TTYD_PORT=7681

# Browser-facing ports: 6080 = websockify (noVNC HTML + WS), 7681 = ttyd (terminal).
# Both are reached only via the deskl.ink Worker proxy; neither is publicly exposed.
EXPOSE 6080 7681

# Drop to the unprivileged desktop user; the entrypoint runs the whole session.
USER desklink
WORKDIR /home/desklink

# start.sh launches VNC + GNOME and then runs websockify in the FOREGROUND as
# PID 1, so the container lifecycle tracks the proxy and SIGTERM shuts cleanly.
ENTRYPOINT ["/usr/local/bin/start.sh"]
