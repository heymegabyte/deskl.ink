# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# deskl.ink — Fedora headless SERVER (browser terminal, no desktop/VNC)
# -----------------------------------------------------------------------------
# Lean Fedora 41 dev server; the only browser-facing service is ttyd on :7681,
# proxied by the Worker under /api/v1/desktops/:id/term/*. Same entrypoint + proxy
# contract as the Ubuntu server image. See container/ubuntu-server for notes.
# -----------------------------------------------------------------------------
FROM --platform=linux/amd64 fedora:41

LABEL org.opencontainers.image.title="deskl.ink Fedora server" \
      org.opencontainers.image.description="Fedora 41 headless dev server — browser terminal (ttyd) on :7681" \
      org.opencontainers.image.source="https://deskl.ink" \
      org.opencontainers.image.vendor="deskl.ink"

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Lean dev server. --setopt=install_weak_deps=False keeps it small; names verified for Fedora 41.
RUN dnf install -y --setopt=install_weak_deps=False \
      git \
      curl \
      wget \
      ca-certificates \
      sudo \
      bash \
      nano \
      vim-enhanced \
      less \
      jq \
      ripgrep \
      fd-find \
      fzf \
      tmux \
      htop \
      unzip \
      openssh-clients \
      gcc \
      gcc-c++ \
      make \
      python3 \
      python3-pip \
      nodejs \
      npm \
 && dnf clean all \
 && rm -rf /var/cache/dnf

RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
      -o /usr/local/bin/ttyd \
 && chmod +x /usr/local/bin/ttyd

RUN useradd --create-home --shell /bin/bash --uid 1001 desklink \
 && usermod -aG wheel desklink \
 && echo 'desklink ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-desklink \
 && chmod 0440 /etc/sudoers.d/90-desklink

COPY start-server.sh /usr/local/bin/start-server.sh
RUN chmod +x /usr/local/bin/start-server.sh

ENV HOME=/home/desklink \
    USER=desklink \
    TTYD_PORT=7681

EXPOSE 7681
USER desklink
WORKDIR /home/desklink
ENTRYPOINT ["/usr/local/bin/start-server.sh"]
