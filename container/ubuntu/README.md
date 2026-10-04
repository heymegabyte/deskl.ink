# deskl.ink — Ubuntu Desktop Container

A lean `linux/amd64` **Ubuntu 24.04 (noble)** image that boots straight into a
lightweight graphical Linux desktop, delivered to the browser over **noVNC** on
a single port — **6080**. No Linux login screen: the graphical session
auto-starts. This is the image Cloudflare Containers runs; the deskl.ink Worker
proxies `/vnc/*` to port **6080**.

---

## Topology (how a browser reaches the desktop)

```
┌─────────┐   wss / https    ┌──────────────┐   ws      ┌────────────┐        ┌──────┐
│ Browser │ ───────────────▶ │  Worker /vnc │ ────────▶ │ :6080      │        │ XFCE │
│ (noVNC) │                  │  (auth+wss)  │           │ websockify │        │  (:1)│
└─────────┘                  └──────────────┘           │  --web +   │        └──────┘
                                                         │  WS proxy  │           ▲
                                                         └─────┬──────┘           │
                                                               │ ws localhost:5901│
                                                               ▼                  │
                                                         ┌──────────────┐  X11    │
                                                         │  Xtigervnc   │ ────────┘
                                                         │   :1 (5901)  │
                                                         │ loopback-only│
                                                         └──────────────┘
```

**One port does two jobs.** `websockify` (from `python3-websockify`) both:

1. **serves the noVNC HTML** from `/usr/share/novnc` — so `http://host:6080/vnc.html`
   (and `http://host:6080/` via an `index.html → vnc.html` symlink) load the client, and
2. **proxies the browser WebSocket** to the local VNC server at `localhost:5901`.

Behind it, **Xtigervnc** runs the X server on display `:1`, and its `xstartup`
launches a full **XFCE** session. websockify runs in the **foreground as PID 1**,
so the container's lifecycle tracks the proxy and a `SIGTERM` shuts the session
down cleanly.

### Why no VNC password?

The VNC server binds **loopback only** (`-localhost yes`) with
`-SecurityTypes None` — **no over-the-wire VNC password**. That is intentional:
nothing can reach port 5901 except websockify _inside the same container_, and
the only public entrypoint is the **deskl.ink Worker**, which authenticates
every connection with a **signed ticket** and terminates **wss** before
proxying to 6080. The container must never be exposed directly to the internet
on 6080 — the Worker is the auth layer.

---

## Why XFCE? (desktop-environment choice)

**XFCE4** is the DE here, deliberately:

- **Lightweight + responsive on a 4 GiB container.** XFCE idles around
  ~300–500 MiB RAM and uses little CPU — critical on Cloudflare Containers where
  memory is capped and there is no GPU. It renders fast and crisply over VNC
  (simple, mostly flat compositing — few expensive animations to push pixels for).
- **Polished + familiar.** Unlike a bare window manager (openbox/fluxbox), XFCE
  gives a complete, professional desktop — panel, app menu, settings, file
  manager — so it reads as a real OS, not a toy, and themes cleanly to the
  deskl.ink dark look.
- **vs the alternatives:**
  - **GNOME** (Ubuntu default) — too heavy (1 GiB+), wants GPU/3D compositing,
    sluggish and tearing over software VNC. Wrong fit for a capped container.
  - **KDE Plasma** — rich but similarly heavyweight and animation-dense; more
    RAM and more bandwidth over the wire.
  - **LXQt / LXDE** — even lighter than XFCE, but less polished and a thinner
    app/settings story; XFCE is the better "looks like a real desktop" balance.
  - **Bare WM (openbox, i3)** — lightest of all, but not a "desktop" a general
    user recognizes; fails the "polished DE" bar.

XFCE is the sweet spot: light enough for the container, complete and polished
enough to feel like a genuine Linux desktop.

---

## What's installed (kept lean on purpose)

Installed via `apt` with `--no-install-recommends`, apt lists cleaned in the
same layer. All package names verified against **Ubuntu 24.04 (noble)**:

| Package                                  | Why                                                                |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `xfce4`                                  | The XFCE desktop environment (panel, WM, settings, file manager)   |
| `xfce4-terminal`                         | A terminal inside the desktop                                      |
| `tigervnc-standalone-server`             | `Xtigervnc` — the headless X/VNC server (universe)                 |
| `tigervnc-common`                        | Shared TigerVNC files (`tigervncserver` wrapper)                   |
| `novnc`                                  | HTML5 VNC client served from `/usr/share/novnc` (ships `vnc.html`) |
| `python3-websockify`                     | Provides `/usr/bin/websockify` (the HTML + WS proxy)               |
| `python3-numpy`                          | websockify HyBi fast-path (smoother, lower-CPU WebSocket)          |
| `dbus-x11`                               | `dbus-launch` — XFCE needs a session bus                           |
| `x11-xserver-utils`                      | `xsetroot` / `xset` (root-window color, disable blanking)          |
| `git`, `curl`, `ca-certificates`, `nano` | Minimal in-desktop basics only                                     |
| `sudo`                                   | Passwordless `sudo` for the `desklink` user                        |

A non-root **`desklink`** user (uid 1001) runs the session and has passwordless
`sudo`. The image `EXPOSE`s **6080**.

> **Deliberately NOT here (yet):** the "batteries" — [Install Doctor](https://install.doctor)
> provisioning, the Superset app bundle, and the broader application superset —
> are a **later ROADMAP fire**, kept out to keep the base image lean and usable
> on a 4 GiB container. See **Roadmap** below.

---

## Build & run locally

No daemon is assumed in CI — build on a machine with Docker:

```bash
cd container/ubuntu

# Build for linux/amd64 (what Cloudflare Containers runs).
docker build --platform linux/amd64 -t deskl-ubuntu .

# Run and expose the browser port.
docker run --rm -p 6080:6080 deskl-ubuntu

# Then open the desktop in a browser:
#   http://localhost:6080/vnc.html      (explicit)
#   http://localhost:6080/              (via index.html → vnc.html symlink)
# Click "Connect" — no password (loopback-only, Worker-authenticated in prod).
```

On a non-amd64 host (e.g. Apple Silicon), `--platform linux/amd64` runs under
emulation (qemu via Docker Desktop) — slower, but correct for a smoke test.

### Runtime knobs (override with `docker run -e`)

| Env var          | Default            | Meaning                               |
| ---------------- | ------------------ | ------------------------------------- |
| `VNC_RESOLUTION` | `1920x1080`        | Desktop geometry `WxH`                |
| `VNC_DISPLAY`    | `:1`               | X display number                      |
| `VNC_PORT`       | `5901`             | Xtigervnc RFB port (`5900 + display`) |
| `NOVNC_PORT`     | `6080`             | Browser-facing websockify port        |
| `NOVNC_WEB`      | `/usr/share/novnc` | noVNC HTML web root                   |

Example: `docker run --rm -p 6080:6080 -e VNC_RESOLUTION=1280x800 deskl-ubuntu`

---

## Files in this directory

- **`Dockerfile`** — `FROM --platform=linux/amd64 ubuntu:24.04`; installs the
  lean package set in one cleaned layer, creates the `desklink` user, symlinks
  noVNC's `index.html`, `EXPOSE 6080`, `ENTRYPOINT` → `start.sh`.
- **`start.sh`** — entrypoint: preps the session, starts `Xtigervnc` on `:1`
  (loopback-only, no password), waits for the RFB port, then execs `websockify`
  in the foreground as PID 1. Traps `SIGTERM`/`SIGINT` for a clean session
  teardown.
- **`xstartup`** — run by Xtigervnc on `:1`: paints the deskl.ink near-black
  (`#05060A`) background, disables screen blanking/DPMS, hides desktop clutter,
  and `exec`s `xfce4-session`.
- **`README.md`** — this file.

---

## Roadmap (deferred to later fires)

These are intentionally **out of scope** for this lean base image and tracked
for later ROADMAP fires:

- **Persistence (restic → R2).** Snapshot the `desklink` home / desktop state on
  shutdown and restore on boot so a restarted container resumes where it left
  off. `start.sh` carries a clearly-marked `TODO(persistence)` at the shutdown
  hook where the snapshot belongs.
- **Install Doctor profile.** Provision the full dev toolchain / dotfiles via
  [Install Doctor](https://install.doctor) on top of the base desktop.
- **Superset + "batteries".** The broader application superset (browsers,
  editors, media, office, dev tools) layered on once the base is proven.
- **Theming depth.** Beyond the solid near-black backdrop: deskl.ink GTK/icon
  theme, cyan accent, wallpaper, panel layout, and a curated app menu.
