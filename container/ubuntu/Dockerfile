# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — browser-delivered Ubuntu desktop (noVNC → TigerVNC → KDE Plasma)
# -----------------------------------------------------------------------------
# A lean linux/amd64 Ubuntu 24.04 (noble) image that boots straight into a
# polished, dark, on-brand KDE Plasma desktop reachable in the browser over
# noVNC. No Linux login screen (no SDDM) — the VNC session autostarts Plasma.
#
# Topology (see README.md for the full diagram):
#   browser ──wss/https──▶ :6080 websockify ──ws──▶ :5901 Xtigervnc ──▶ Plasma (:1)
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
      org.opencontainers.image.description="Ubuntu 24.04 KDE Plasma desktop over noVNC on :6080" \
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
# Package names verified against Ubuntu 24.04 (noble), 2026-10. Noble ships
# KDE Plasma 5.27.x (the default repos do NOT provide Plasma 6).
#
#   kde-plasma-desktop ............ MINIMAL Plasma meta-package (Plasma shell,
#                                   System Settings, session + core components).
#                                   Its sddm / xserver-xorg / kwin-x11 deps are
#                                   RECOMMENDS, so --no-install-recommends keeps
#                                   the login manager OUT (we want NO SDDM).
#   kwin-x11 ...................... THE X11 window manager/compositor. kwin-x11
#                                   is only a *recommend* of kde-plasma-desktop,
#                                   so --no-install-recommends would otherwise
#                                   leave Plasma with NO window manager. Explicit
#                                   here — without it windows have no borders /
#                                   no management (the #1 Plasma-over-Xvnc trap).
#   plasma-workspace .............. provides startplasma-x11 + plasmashell. Pulled
#                                   transitively by the meta anyway; explicit =
#                                   belt-and-suspenders so the session launcher
#                                   is guaranteed present.
#   konsole ....................... KDE terminal (NOT in the minimal meta)
#   dolphin ....................... KDE file manager (NOT in the minimal meta —
#                                   only in kde-standard; add explicitly)
#   firefox ....................... browser inside the desktop (noble apt)
#   dbus-x11 ...................... dbus-launch / dbus-run-session — Plasma needs
#                                   its OWN session bus or plasmashell segfaults
#   x11-xserver-utils ............. xsetroot/xset (root-window color, blanking off)
#   fonts-noto fonts-noto-color-emoji  crisp text + emoji (default fonts are thin)
#   tigervnc-standalone-server .... Xtigervnc headless X/VNC server (universe)
#   tigervnc-common ............... tigervncserver wrapper + shared files
#   novnc ......................... HTML5 VNC client → /usr/share/novnc (vnc.html)
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
      kde-plasma-desktop \
      kwin-x11 \
      plasma-workspace \
      konsole \
      dolphin \
      firefox \
      dbus-x11 \
      x11-xserver-utils \
      fonts-noto \
      fonts-noto-color-emoji \
      tigervnc-standalone-server \
      tigervnc-common \
      novnc \
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

# -----------------------------------------------------------------------------
# Non-root desktop user `desklink` with passwordless sudo (NOPASSWD so the
# in-container shell can admin the box without a password the user never set).
# -----------------------------------------------------------------------------
RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG sudo desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

# -----------------------------------------------------------------------------
# Pre-baked deskl.ink brand look (shipped under ./config/, copied into the
# user's ~/.config so Plasma opens dark + on-brand on the FIRST boot):
#   kwinrc .................. [Compositing] Enabled=false — compositing OFF is
#                            critical over software VNC with no GPU (tear-free,
#                            far lower CPU/bandwidth). Also pins kwin_x11 as WM.
#   kdeglobals ............. Breeze Dark color scheme + cyan (#00E5FF) accent +
#                            Breeze Dark look-and-feel package (dark, intentional)
#   plasma-org.kde.plasma.desktop-appletsrc
#                            desktop wallpaper = solid near-black (#05060A) via
#                            the org.kde.color wallpaper plugin (no PNG needed)
#   kscreenlockerrc ........ screen locker OFF (headless; nothing to lock)
#   kwalletrc .............. KWallet OFF (no wallet password to unlock)
# The near-black wallpaper PNG is ALSO shipped as a guaranteed fallback.
# -----------------------------------------------------------------------------
COPY config/ /home/desklink/.config/
COPY assets/wallpaper-05060A.png /home/desklink/.local/share/wallpapers/deskl-dark/contents/images/1920x1080.png

# Entry + session scripts. Copied as root, made executable, owned by desklink so
# the user can edit its own session config at runtime.
COPY start.sh /usr/local/bin/start.sh
COPY xstartup /home/desklink/.vnc/xstartup

RUN chmod +x /usr/local/bin/start.sh /home/desklink/.vnc/xstartup \
 && mkdir -p /home/desklink/.vnc /home/desklink/.cache /home/desklink/.local/share \
 && chown -R desklink:desklink /home/desklink/.vnc /home/desklink/.config /home/desklink/.cache /home/desklink/.local

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

# start.sh launches VNC + Plasma and then runs websockify in the FOREGROUND as
# PID 1, so the container lifecycle tracks the proxy and SIGTERM shuts cleanly.
ENTRYPOINT ["/usr/local/bin/start.sh"]
