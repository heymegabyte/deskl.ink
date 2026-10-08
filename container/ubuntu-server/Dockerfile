# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — Ubuntu headless SERVER (browser terminal, no desktop/VNC)
# -----------------------------------------------------------------------------
# A lean linux/amd64 Ubuntu 24.04 image optimized for terminal / OpenCode / files
# / ports / agents — NOT a graphical desktop (spec §9: a Server is not "a desktop
# with VNC hidden"). The only browser-facing service is ttyd (xterm.js over WS) on
# :7681; the deskl.ink Worker proxies /api/v1/desktops/:id/term/* to it with the
# same signed-ticket auth as the desktop terminal. No KDE, no Xvnc, no websockify —
# so it boots fast and costs less.
#
# Build (locally; `wrangler deploy` also builds it):
#   docker build --platform linux/amd64 -t deskl-ubuntu-server container/ubuntu-server
#   docker run -p 7681:7681 deskl-ubuntu-server   # → http://localhost:7681/
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 ubuntu:24.04

LABEL org.opencontainers.image.title="deskl.ink Ubuntu server" \
      org.opencontainers.image.description="Ubuntu 24.04 headless dev server — browser terminal (ttyd) on :7681" \
      org.opencontainers.image.source="https://deskl.ink" \
      org.opencontainers.image.vendor="deskl.ink"

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# A useful-out-of-the-box dev server (spec §15/§24) kept lean enough to boot quick:
# git/gh-less curl, build toolchain, Python, Node, and the common CLI ergonomics.
# Heavier/rarely-needed stacks (Go, Rust, Bun, DB clients) install on demand.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git \
      curl \
      wget \
      ca-certificates \
      sudo \
      bash \
      nano \
      vim-tiny \
      less \
      jq \
      ripgrep \
      fd-find \
      fzf \
      tmux \
      htop \
      unzip \
      openssh-client \
      build-essential \
      python3 \
      python3-pip \
      python3-venv \
      nodejs \
      npm \
 && rm -rf /var/lib/apt/lists/*

# Browser terminal: the ttyd static binary (pinned). Same binary + proxy contract
# as the desktop image's terminal, so the Worker's /term/* route is identical.
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
      -o /usr/local/bin/ttyd \
 && chmod +x /usr/local/bin/ttyd

# Non-root user with passwordless sudo (same model as the desktop image).
RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG sudo desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

COPY start-server.sh /usr/local/bin/start-server.sh
RUN chmod +x /usr/local/bin/start-server.sh

ENV HOME=/home/desklink \
    USER=desklink \
    TTYD_PORT=7681

# The browser-facing terminal port (proxied by the Worker; never public directly).
EXPOSE 7681

USER desklink
WORKDIR /home/desklink

# ttyd runs in the FOREGROUND as PID 1 — the container lives as long as the
# terminal server, and SIGTERM stops it cleanly.
ENTRYPOINT ["/usr/local/bin/start-server.sh"]
