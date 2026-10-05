# deskl.ink — Fedora Desktop Container

A `linux/amd64` **Fedora 41** image that boots straight into a polished, dark,
on-brand **KDE Plasma 6** desktop, delivered to the browser over **noVNC** on a
single port — **6080**. No Linux login screen (no SDDM / no Plasma login
manager): the graphical session auto-starts. This is the Fedora sibling of
`../ubuntu` and the image Cloudflare Containers runs; the deskl.ink Worker
proxies `/vnc/*` to port **6080**.

> **Same hard contract as the Ubuntu image.** `start.sh`, the port wiring, the
> loopback-only server, the foreground-`websockify`-as-PID-1 model, the
> `SIGTERM` trap, `EXPOSE 6080`, and the whole deskl.ink brand look are
> **identical**. Only the base distro (Fedora vs Ubuntu), the package manager
> (`dnf` vs `apt`), the Plasma **major version** (6 vs 5), and the VNC wrapper
> **command name** (`vncserver` vs `tigervncserver`) differ. The Worker needs no
> changes to proxy this container.

---

## Topology (how a browser reaches the desktop)

```
┌─────────┐   wss / https    ┌──────────────┐   ws      ┌────────────┐        ┌────────┐
│ Browser │ ───────────────▶ │  Worker /vnc │ ────────▶ │ :6080      │        │ Plasma │
│ (noVNC) │                  │  (auth+wss)  │           │ websockify │        │  (:1)  │
└─────────┘                  └──────────────┘           │  --web +   │        └────────┘
                                                         │  WS proxy  │           ▲
                                                         └─────┬──────┘           │
                                                               │ ws localhost:5901│
                                                               ▼                  │
                                                         ┌──────────────┐  X11    │
                                                         │     Xvnc     │ ────────┘
                                                         │   :1 (5901)  │
                                                         │ loopback-only│
                                                         └──────────────┘
```

**One port does two jobs.** `websockify` (from `python3-websockify`) both:

1. **serves the noVNC HTML** from `/usr/share/novnc` — so `http://host:6080/vnc.html`
   (and `http://host:6080/` via an `index.html → vnc.html` symlink) load the client, and
2. **proxies the browser WebSocket** to the local VNC server at `localhost:5901`.

Behind it, **Xvnc** (Fedora's TigerVNC server) runs the X server on display `:1`,
and its `xstartup` launches a full **KDE Plasma 6** session (`startplasma-x11`,
with `kwin_x11` as the window manager). websockify runs in the **foreground as
PID 1**, so the container's lifecycle tracks the proxy and a `SIGTERM` shuts the
session down cleanly.

### Why no VNC password?

The VNC server binds **loopback only** (`-localhost yes`) with
`-SecurityTypes None` — **no over-the-wire VNC password**. That is intentional:
nothing can reach port 5901 except websockify _inside the same container_, and
the only public entrypoint is the **deskl.ink Worker**, which authenticates
every connection with a **signed ticket** and terminates **wss** before
proxying to 6080. The container must never be exposed directly to the internet
on 6080 — the Worker is the auth layer.

---

## Why KDE Plasma? (desktop-environment choice)

**KDE Plasma 6** (the version Fedora 41 ships, Qt6) is the DE here: a complete,
modern, genuinely premium-looking desktop that themes cleanly to the deskl.ink
dark look. It is heavier than XFCE but, **with compositing disabled** (see
below), it idles comfortably inside the 4 GiB container budget while looking far
more polished and intentional out of the box.

The tuning that makes Plasma a good fit over software VNC:

- **Compositing OFF** (`~/.config/kwinrc` → `[Compositing] Enabled=false`). This
  is the single most important setting. KWin's compositor wants OpenGL/XRender
  for blur, shadows, and fades — but there is **no GPU** in the container, so the
  effects would be software-emulated, causing tearing, high CPU, and heavy pixel
  churn over the WebSocket. Disabled, Plasma renders flat, crisp, and cheap.
- **No animations** (`AnimationDurationFactor=0`), **no screen locker**
  (headless, nothing to lock), **no KWallet prompt** (no password was ever set)
  — all pre-baked so the first boot is clean and never dead-ends on a dialog.
- **Lean package set** (`plasma-workspace` + `plasma-workspace-x11` +
  `plasma-desktop`, NOT the full `@kde-desktop-environment` group) plus only the
  apps we actually want, installed with weak deps off.

**vs the alternatives:** same reasoning as the Ubuntu image — XFCE is lighter
but less polished; GNOME is too heavy and hard-wants GPU compositing; LXQt/LXDE
feel less premium; a bare WM isn't a "desktop" a general user recognizes.

---

## The deskl.ink brand look (pre-baked, dark on first boot)

Config is shipped under `./config/` (byte-identical to the Ubuntu image — KDE
config is cross-distro) and copied into the `desklink` user's `~/.config/` so
Plasma opens **dark + on-brand with no trip through System Settings**:

| File                                             | What it sets                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `kdeglobals`                                     | **Breeze Dark** color scheme + look-and-feel (`org.kde.breezedark.desktop`), deskl.ink **cyan `#00E5FF`** (`AccentColor=0,229,255`) as accent + selection/hover/decoration-focus, `breeze-dark` icons, Noto fonts |
| `kwinrc`                                         | **Compositing OFF** (`[Compositing] Enabled=false`, `OpenGLIsUnsafe=true`), click-to-focus, no animation |
| `plasma-org.kde.plasma.desktop-appletsrc`        | Desktop wallpaper = **solid near-black `#05060A`** via the `org.kde.color` plugin (`Color=5,6,10`)        |
| `kscreenlockerrc`                                | Screen locker **off** (headless; nothing to lock, no password set)                                        |
| `kwalletrc`                                       | KWallet **off** (no interactive wallet password to unlock)                                                |
| `autostart/deskl-theme.desktop` + `deskl-apply-theme.sh` | Re-assert the dark look + wallpaper **live** after plasmashell starts (it regenerates `appletsrc` on first run — KDE autostart phase 2, retries until the apply sticks) |

The near-black wallpaper is set the **deterministic** way (a solid color via
`org.kde.color` — no image to decode, instant, near-zero bytes over VNC). A
1920×1080 dark PNG is **also** shipped at `~/.local/share/wallpapers/deskl-dark/`
as a guaranteed fallback (switch the containment's `wallpaperplugin` to
`org.kde.image` to use it), and `deskl-apply-theme.sh` applies it live via
`plasma-apply-wallpaperimage`.

> The only Plasma-6-specific tweak in the config is in `deskl-apply-theme.sh`:
> it prefers **`kwriteconfig6`** (Qt6) for the live accent write and falls back
> to `kwriteconfig5`. The `plasma-apply-lookandfeel` / `-colorscheme` /
> `-wallpaperimage` tool names are unchanged between Plasma 5 and 6.

---

## What's installed (kept lean on purpose)

Installed via `dnf` with weak deps off (`--setopt=install_weak_deps=False
--nodocs`), the dnf cache cleaned in the same layer. All package names verified
against **Fedora 41** (Plasma 6):

| Package                                                                      | Why                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `plasma-workspace`                                                           | Core Plasma — `plasmashell`, krunner, KCM machinery, and the `plasma-apply-*` tools   |
| `plasma-workspace-x11`                                                       | **⚠ The critical Fedora package** — provides `startplasma-x11` (the X11 launcher, NOT shipped by the Wayland-first `plasma-workspace`) and pulls in `kwin-x11` + Xorg |
| `kwin-x11`                                                                   | The X11 window manager/compositor — listed explicitly (belt-and-suspenders; also a dep of `plasma-workspace-x11`) |
| `plasma-desktop`                                                             | System Settings + desktop KCMs (keeps the box configurable)                           |
| `konsole`                                                                    | KDE terminal                                                                          |
| `dolphin`                                                                    | KDE file manager                                                                      |
| `firefox`                                                                    | Browser inside the desktop                                                            |
| `dbus-x11`                                                                   | `dbus-launch` / `dbus-run-session` — Plasma needs its own session bus                 |
| `xsetroot`                                                                   | Root-window solid color (deskl.ink backdrop). **Now its own package** on F41 — the old `xorg-x11-server-utils` meta is retired/split |
| `xset`                                                                       | Disable screen blanking / DPMS (headless). Also its own package post-split            |
| `google-noto-sans-fonts`, `google-noto-mono-fonts`, `google-noto-emoji-fonts`, `google-noto-color-emoji-fonts` | Crisp text + emoji (explicit, lean — the `@fonts` group analogue) |
| `tigervnc-server`                                                            | `Xvnc` — the headless X/VNC server + the `/usr/bin/vncserver` Perl wrapper             |
| `novnc`                                                                      | HTML5 VNC client served from `/usr/share/novnc` (ships `vnc.html`)                    |
| `python3-websockify`                                                         | Provides `/usr/bin/websockify` (the HTML + WS proxy)                                  |
| `python3-numpy`                                                              | websockify HyBi fast-path (smoother, lower-CPU WebSocket)                             |
| `sudo`                                                                       | Passwordless `sudo` for the `desklink` user (in the `wheel` group on Fedora)          |
| `git`, `curl`, `ca-certificates`, `nano`                                     | Minimal in-desktop basics only                                                        |

A non-root **`desklink`** user (uid 1001) runs the session and has passwordless
`sudo` (added to Fedora's `wheel` group). The image `EXPOSE`s **6080**.

### Fedora-vs-Ubuntu differences that actually matter (read before editing)

1. **`plasma-workspace-x11` is mandatory — and is the whole ballgame.** Fedora's
   Plasma 6 defaults to a **Wayland** session; the plain `plasma-workspace`
   package does **not** ship `startplasma-x11`. The X11 session launcher + the
   `kwin-x11` WM live in `plasma-workspace-x11`. Omit it and there is **no X11
   Plasma session at all** — the exact Fedora analogue of the Ubuntu image's
   "must install `kwin-x11` explicitly" trap, but one level deeper.
2. **The VNC wrapper is `vncserver`, not `tigervncserver`.** Fedora's
   `tigervnc-server` ships the Perl wrapper as `/usr/bin/vncserver`; the
   `tigervncserver` name is a Debian-ism. Same upstream TigerVNC flags
   (`-localhost yes`, `-SecurityTypes None`, `-geometry`, `-depth`, `-xstartup`,
   `-verbose`, `-kill`). `start.sh` detects `vncserver` and falls back to
   `tigervncserver`, so it runs on both distros unchanged.
3. **`xorg-x11-server-utils` is retired on F41.** It was split into individual
   packages — install **`xsetroot`** and **`xset`** directly (the Ubuntu image's
   `x11-xserver-utils` equivalent).
4. **sudo group is `wheel`** (Ubuntu uses `sudo`). The `NOPASSWD` drop-in in
   `/etc/sudoers.d/` is what actually grants passwordless sudo either way.
5. **No login manager.** We install the lean package set (not the
   `@kde-desktop-environment` group, which would pull SDDM/Plasma-login + a full
   app set) — so nothing auto-starts a display/login manager; the VNC session
   starts Plasma directly, same as the Ubuntu image's `--no-install-recommends`
   leaving SDDM out.

### Plasma-over-Xvnc gotchas (unchanged from Ubuntu)

Plasma needs its **own D-Bus session bus** (or `plasmashell` segfaults) →
`xstartup` runs the session under `dbus-run-session`. **`XDG_RUNTIME_DIR` must
exist at `0700`** (no systemd/elogind to make `/run/user/<uid>`) → `start.sh` +
`xstartup` provision `/tmp/runtime-desklink`. **`XDG_SESSION_TYPE=x11`** +
**`XDG_CURRENT_DESKTOP=KDE`** force the X11 session (doubly important on Fedora,
whose default is Wayland). **`LIBGL_ALWAYS_SOFTWARE=1`** for any stray GL client
since there's no GPU.

### Resource budget (4 GiB container)

- **Idle RAM:** ~**1.1–1.5 GiB** for Plasma 6 with compositing disabled and no
  apps open (plasmashell + kwin_x11 + kded + Xvnc). Plasma 6/Qt6 idles a touch
  heavier than the Ubuntu image's Plasma 5 (~0.9–1.3 GiB), but still comfortably
  under the 4 GiB cap, leaving ~2.5 GiB for Firefox/apps. Tip: `baloo` file
  indexing can be disabled to shave RAM (`balooctl6 disable`).
- **Image size (uncompressed):** ~**2.8–3.4 GiB** (Fedora base + Plasma 6 + KDE
  apps + Firefox + Noto fonts). Fedora's base layer + Qt6 Plasma run a bit larger
  than the Ubuntu image's ~2.3–2.9 GiB. This is an **estimate** — the image is
  not built in this authoring environment; measure with `docker images` after a
  real build.

> **Deliberately NOT here (yet):** the "batteries" — [Install Doctor](https://install.doctor)
> provisioning, the Superset app bundle, and the broader application superset —
> are a **later ROADMAP fire**, kept out to keep the base image lean and usable
> on a 4 GiB container. See **Roadmap** below.

---

## Build & run locally

No daemon is assumed in CI — build on a machine with Docker:

```bash
cd container/fedora

# Build for linux/amd64 (what Cloudflare Containers runs).
docker build --platform linux/amd64 -t deskl-fedora .

# Run and expose the browser port.
docker run --rm -p 6080:6080 deskl-fedora

# Then open the desktop in a browser:
#   http://localhost:6080/vnc.html      (explicit)
#   http://localhost:6080/              (via index.html → vnc.html symlink)
# Click "Connect" — no password (loopback-only, Worker-authenticated in prod).
```

On a non-amd64 host (e.g. Apple Silicon), `--platform linux/amd64` runs under
emulation (qemu via Docker Desktop) — slower, but correct for a smoke test.
Plasma under qemu will be sluggish; this is an emulation artifact, not a real
performance signal.

### Runtime knobs (override with `docker run -e`)

| Env var           | Default                 | Meaning                               |
| ----------------- | ----------------------- | ------------------------------------- |
| `VNC_RESOLUTION`  | `1920x1080`             | Desktop geometry `WxH`                |
| `VNC_DISPLAY`     | `:1`                    | X display number                      |
| `VNC_PORT`        | `5901`                  | Xvnc RFB port (`5900 + display`)      |
| `NOVNC_PORT`      | `6080`                  | Browser-facing websockify port        |
| `NOVNC_WEB`       | `/usr/share/novnc`      | noVNC HTML web root                   |
| `XDG_RUNTIME_DIR` | `/tmp/runtime-desklink` | Plasma/KWin private socket dir (0700) |

Example: `docker run --rm -p 6080:6080 -e VNC_RESOLUTION=1280x800 deskl-fedora`

---

## Files in this directory

- **`Dockerfile`** — `FROM --platform=linux/amd64 fedora:41`; installs the lean
  Plasma 6 package set in one cleaned `dnf` layer, creates the `desklink` user,
  copies the brand config + wallpaper, symlinks noVNC's `index.html`,
  `EXPOSE 6080`, `ENTRYPOINT` → `start.sh`.
- **`start.sh`** — entrypoint (same VNC topology as Ubuntu): preps the session +
  `XDG_RUNTIME_DIR`, starts `Xvnc` on `:1` via the `vncserver` wrapper
  (loopback-only, no password), waits for the RFB port, then runs `websockify`
  in the foreground as PID 1. Traps `SIGTERM`/`SIGINT` for clean teardown.
- **`xstartup`** — run by Xvnc on `:1`: sets up the fresh D-Bus session + XDG
  env, paints the deskl.ink near-black (`#05060A`) backdrop, disables screen
  blanking/DPMS, and `exec`s `dbus-run-session -- startplasma-x11`.
- **`config/`** — pre-baked KDE config (`kdeglobals`, `kwinrc`,
  `plasma-org.kde.plasma.desktop-appletsrc`, `kscreenlockerrc`, `kwalletrc`,
  `deskl-apply-theme.sh`, `autostart/deskl-theme.desktop`) → copied to
  `~/.config/`.
- **`assets/wallpaper-05060A.png`** — 1920×1080 dark fallback wallpaper.
- **`README.md`** — this file.

---

## Roadmap (deferred to later fires)

These are intentionally **out of scope** for this base image and tracked for
later ROADMAP fires (identical to the Ubuntu image's roadmap):

- **Persistence (restic → R2).** Snapshot the `desklink` home / desktop state on
  shutdown and restore on boot so a restarted container resumes where it left
  off. `start.sh` carries a clearly-marked `TODO(persistence)` at the shutdown
  hook where the snapshot belongs.
- **Install Doctor profile.** Provision the full dev toolchain / dotfiles via
  [Install Doctor](https://install.doctor) on top of the base desktop.
- **Superset + "batteries".** The broader application superset (editors, media,
  office, dev tools) layered on once the base is proven.
- **Theming depth.** A bespoke deskl.ink Plasma look-and-feel package, a custom
  panel layout, a curated app menu / favorites, and a cyan Plasma splash.
- **RAM trimming.** Disable `baloo` indexing and prune `kded` modules if the
  idle footprint needs to come down further on constrained hosts.
