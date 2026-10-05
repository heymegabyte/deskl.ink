# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — browser-delivered Fedora desktop (noVNC → TigerVNC → KDE Plasma 6)
# -----------------------------------------------------------------------------
# A lean linux/amd64 Fedora 41 image that boots straight into a polished, dark,
# on-brand KDE Plasma 6 desktop reachable in the browser over noVNC. No Linux
# login screen (no SDDM / no Plasma login manager) — the VNC session autostarts
# Plasma. This is the Fedora sibling of ../ubuntu; the VNC topology, port wiring,
# the loopback-only server, the foreground-websockify-as-PID-1 model, the
# SIGTERM trap, AND the deskl.ink brand look are all IDENTICAL — only the base
# distro + package manager + Plasma major version differ.
#
# Topology (see README.md for the full diagram):
#   browser ──wss/https──▶ :6080 websockify ──ws──▶ :5901 Xvnc ──▶ Plasma (:1)
#
# websockify serves the noVNC HTML *and* proxies the WebSocket to the local VNC
# server, so the single exposed port is 6080. This is what Cloudflare Containers
# runs; the deskl.ink Worker proxies /vnc/* to port 6080 and is the layer that
# authenticates (signed ticket + wss) — the VNC server itself runs loopback-only
# with NO over-the-wire password (see start.sh for the rationale).
#
# Build (no daemon is assumed in CI authoring — build locally):
#   docker build --platform linux/amd64 -t deskl-fedora .
#   docker run -p 6080:6080 deskl-fedora   # → http://localhost:6080/vnc.html
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 fedora:41

# OCI metadata — helps registries/Cloudflare surface what this image is.
LABEL org.opencontainers.image.title="deskl.ink Fedora desktop" \
      org.opencontainers.image.description="Fedora 41 KDE Plasma 6 desktop over noVNC on :6080" \
      org.opencontainers.image.source="https://deskl.ink" \
      org.opencontainers.image.vendor="deskl.ink"

# Stable, predictable locale/tz for the desktop session.
ENV TZ=Etc/UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DISPLAY=:1

# -----------------------------------------------------------------------------
# System packages — ONE layer: install → clean all. Package names verified
# against Fedora 41, 2026-10. Fedora 41 ships KDE Plasma 6 (Qt6); unlike Ubuntu
# noble's Plasma 5, Fedora's Plasma defaults to a WAYLAND session and SPLITS the
# X11 session into a separate package — so we install the lean set rather than
# the heavy `@kde-desktop-environment` group (which pulls SDDM + a full app set
# we do not want on a capped container).
#
#   plasma-workspace ........... core Plasma (plasmashell, krunner, the KCM
#                                machinery, and the plasma-apply-lookandfeel /
#                                -colorscheme / -wallpaperimage brand tools).
#   plasma-workspace-x11 ....... ⚠ THE critical Fedora-specific package: it
#                                provides /usr/bin/startplasma-x11 (the X11
#                                session launcher — NOT shipped by the default
#                                Wayland-first plasma-workspace) and pulls in
#                                kwin-x11 + the Xorg server as dependencies.
#                                Without it there is no X11 Plasma session at all
#                                (the #1 Plasma-6-on-Fedora trap). This is the
#                                Fedora analogue of Ubuntu's explicit kwin-x11.
#   kwin-x11 ................... THE X11 window manager/compositor. Pulled in by
#                                plasma-workspace-x11, but listed explicitly =
#                                belt-and-suspenders so the WM is guaranteed
#                                present (no WM → windows have no borders / no
#                                management — same trap as the Ubuntu image).
#   plasma-desktop ............. System Settings + the desktop KCMs / shell bits
#                                (the Fedora analogue of kde-plasma-desktop's
#                                settings surface; keeps the box configurable).
#   konsole ................... KDE terminal
#   dolphin ................... KDE file manager
#   firefox ................... browser inside the desktop
#   dbus-x11 .................. dbus-launch / dbus-run-session — Plasma needs its
#                               OWN session bus or plasmashell segfaults
#   xsetroot .................. root-window solid color (deskl.ink backdrop). On
#                               Fedora 41 the old xorg-x11-server-utils meta is
#                               RETIRED/split — xsetroot is its own package now.
#   xset ...................... screen blanking / DPMS off (headless, no monitor).
#                               Also its own package post-split (NOT in a meta).
#   google-noto-sans-fonts / -mono- / -emoji- / -color-emoji-
#                               crisp text + emoji (the `@fonts` group analogue,
#                               picked explicitly to stay lean — default fonts
#                               are thin / lack emoji coverage).
#   tigervnc-server ........... Xvnc headless X/VNC server + the /usr/bin/vncserver
#                               Perl wrapper (Fedora names it `vncserver`, not
#                               Ubuntu's `tigervncserver` — same upstream flags).
#   novnc ..................... HTML5 VNC client → /usr/share/novnc (vnc.html)
#   python3-websockify ........ provides /usr/bin/websockify (HTML + WS proxy)
#   python3-numpy ............. websockify HyBi fast-path (lower-CPU WebSocket)
#   sudo ...................... passwordless sudo for the desklink user
#   git / curl / ca-certificates / nano  minimal in-desktop basics ONLY (lean)
#
# NOTE: the "batteries" (Install Doctor profile + the broader app superset) are a
# LATER ROADMAP fire — deliberately NOT installed here to keep the base image
# lean and usable on a 4 GiB container. See README.md § Roadmap.
# -----------------------------------------------------------------------------
RUN dnf -y install --setopt=install_weak_deps=False --nodocs \
      plasma-workspace \
      plasma-workspace-x11 \
      kwin-x11 \
      plasma-desktop \
      konsole \
      dolphin \
      firefox \
      dbus-x11 \
      xsetroot \
      xset \
      google-noto-sans-fonts \
      google-noto-mono-fonts \
      google-noto-emoji-fonts \
      google-noto-color-emoji-fonts \
      tigervnc-server \
      novnc \
      python3-websockify \
      python3-numpy \
      sudo \
      git \
      curl \
      ca-certificates \
      nano \
 && dnf clean all \
 && rm -rf /var/cache/dnf

# noVNC's default landing page is vnc.html; symlink index.html → vnc.html so the
# bare path (http://host:6080/) also loads the client. /vnc.html already works.
RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# -----------------------------------------------------------------------------
# Non-root desktop user `desklink` with passwordless sudo (NOPASSWD so the
# in-container shell can admin the box without a password the user never set).
# uid 1001 matches the Ubuntu image. `wheel` is Fedora's sudo group (vs Ubuntu's
# `sudo` group) — the NOPASSWD drop-in is what actually grants it either way.
# -----------------------------------------------------------------------------
RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG wheel desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

# -----------------------------------------------------------------------------
# Pre-baked deskl.ink brand look (shipped under ./config/, copied into the
# user's ~/.config so Plasma opens dark + on-brand on the FIRST boot). These
# files are byte-identical to the Ubuntu image — KDE config is cross-distro:
#   kwinrc .................. [Compositing] Enabled=false — compositing OFF is
#                            critical over software VNC with no GPU (tear-free,
#                            far lower CPU/bandwidth). Also pins kwin_x11 as WM.
#   kdeglobals ............. Breeze Dark color scheme + cyan (#00E5FF) accent +
#                            Breeze Dark look-and-feel (org.kde.breezedark.desktop)
#   plasma-org.kde.plasma.desktop-appletsrc
#                            desktop wallpaper = solid near-black (#05060A) via
#                            the org.kde.color wallpaper plugin
#   kscreenlockerrc ........ screen locker OFF (headless; nothing to lock)
#   kwalletrc .............. KWallet OFF (no wallet password to unlock)
#   autostart/deskl-theme.desktop + deskl-apply-theme.sh
#                            re-assert the dark look LIVE after plasmashell starts
#                            (plasmashell regenerates appletsrc on first run).
# The near-black wallpaper PNG is ALSO shipped as a guaranteed fallback.
# -----------------------------------------------------------------------------
COPY config/ /home/desklink/.config/
COPY assets/wallpaper-05060A.png /home/desklink/.local/share/wallpapers/deskl-dark/contents/images/1920x1080.png

# Entry + session scripts. Copied as root, made executable, owned by desklink so
# the user can edit its own session config at runtime.
COPY start.sh /usr/local/bin/start.sh
COPY xstartup /home/desklink/.vnc/xstartup

RUN chmod +x /usr/local/bin/start.sh /home/desklink/.vnc/xstartup \
            /home/desklink/.config/deskl-apply-theme.sh \
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
