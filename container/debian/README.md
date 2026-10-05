# deskl.ink — Debian Desktop Container

A `linux/amd64` **Debian 12 (bookworm)** image that boots straight into a
polished, dark, on-brand **KDE Plasma** desktop, delivered to the browser over
**noVNC** on a single port — **6080**. No Linux login screen (no SDDM): the
graphical session auto-starts. This is the image Cloudflare Containers runs; the
deskl.ink Worker proxies `/vnc/*` to port **6080**.

> **Debian sibling of [`../ubuntu`](../ubuntu).** Ubuntu derives from Debian, so
> this is the easiest possible port: the same `apt`, near-identical package
> names, and the **same Plasma 5.27** (bookworm ships Plasma **5.27.5**, matching
> Ubuntu noble). `start.sh`, `xstartup`, the whole `config/` tree, and the
> wallpaper are **byte-identical** to the Ubuntu image — only the base image
> (`debian:12`) and one package name (`firefox` → `firefox-esr`) differ.

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
launches a full **KDE Plasma** session (`startplasma-x11`, with `kwin_x11` as the
window manager). websockify runs in the **foreground as PID 1**, so the
container's lifecycle tracks the proxy and a `SIGTERM` shuts the session down
cleanly.

> The VNC topology is identical to the Ubuntu image — only the base distro was
> swapped. `start.sh`, the port wiring, the loopback-only server, the
> foreground-websockify-as-PID-1 model, and the SIGTERM trap are byte-identical.

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

**KDE Plasma 5.27** (the version bookworm ships) is the DE here: a complete,
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
- **Minimal meta-package** (`kde-plasma-desktop`, not `kde-standard`/`kde-full`)
  plus only the apps we actually want, installed `--no-install-recommends`.

**vs the alternatives:**

- **XFCE** — lighter, but less modern/polished; Plasma with compositing off
  closes most of the weight gap while looking considerably nicer.
- **GNOME** (hard-wants GPU/3D compositing) — too heavy (1 GiB+), sluggish and
  tearing over software VNC. Wrong fit for a capped container.
- **LXQt / LXDE** — lighter than both, but a thinner, less premium app/settings
  story; fails the "looks like a high-end desktop" bar deskl.ink wants.
- **Bare WM (openbox, i3)** — lightest of all, but not a "desktop" a general user
  recognizes.

---

## The deskl.ink brand look (pre-baked, dark on first boot)

Config is shipped under `./config/` and copied into the `desklink` user's
`~/.config/` so Plasma opens **dark + on-brand with no trip through System
Settings**. These files are **byte-identical to the Ubuntu image** (Plasma 5.27
on both):

| File                                             | What it sets                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `kdeglobals`                                     | **Breeze Dark** color scheme + look-and-feel (`org.kde.breezedark.desktop`), deskl.ink **cyan `#00E5FF`** (`AccentColor=0,229,255`) as accent + selection/hover/decoration-focus, `breeze-dark` icons, Noto fonts |
| `kwinrc`                                         | **Compositing OFF** (`[Compositing] Enabled=false`, `OpenGLIsUnsafe=true`), click-to-focus, no animation |
| `plasma-org.kde.plasma.desktop-appletsrc`        | Desktop wallpaper = **solid near-black `#05060A`** via the `org.kde.color` plugin (`Color=5,6,10`)        |
| `kscreenlockerrc`                                | Screen locker **off** (headless; nothing to lock, no password set)                                        |
| `kwalletrc`                                       | KWallet **off** (no interactive wallet password to unlock)                                                |
| `autostart/deskl-theme.desktop` + `deskl-apply-theme.sh` | Re-assert the dark look **LIVE** once `plasmashell` is up (it regenerates its `appletsrc`/wallpaper on first run — the script retries `plasma-apply-*` until the near-black wallpaper + Breeze Dark stick) |

The near-black wallpaper is set the **deterministic** way (a solid color via
`org.kde.color` — no image to decode, instant, near-zero bytes over VNC). A
1920×1080 dark PNG with a very subtle cyan glow is **also** shipped at
`~/.local/share/wallpapers/deskl-dark/` as a guaranteed fallback (switch the
containment's `wallpaperplugin` to `org.kde.image` to use it).

> Result: a dark, cyan-accented, flat-and-crisp Plasma desktop — premium and
> intentional, not default-gray.

---

## What's installed (kept lean on purpose)

Installed via `apt` with `--no-install-recommends`, apt lists cleaned in the
same layer. All package names verified against **Debian 12 (bookworm)** (Plasma
5.27.5 — bookworm's default repos do not provide Plasma 6):

| Package                                  | Why                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `kde-plasma-desktop`                     | Minimal Plasma meta-package (shell, System Settings, core session components)        |
| `kwin-x11`                               | **The X11 window manager/compositor** — only a *recommend* of the meta, so explicit (see gotcha below) |
| `plasma-workspace`                       | Provides `startplasma-x11` + `plasmashell` (explicit = guaranteed present)            |
| `konsole`                                | KDE terminal (not in the minimal meta)                                               |
| `dolphin`                                | KDE file manager (not in the minimal meta — only in `kde-standard`)                  |
| `firefox-esr`                            | Browser inside the desktop. **Debian ships only `firefox-esr`** (no plain `firefox` package in bookworm) — the one Ubuntu→Debian package-name change |
| `dbus-x11`                               | `dbus-launch` / `dbus-run-session` — Plasma needs its own session bus                |
| `x11-xserver-utils`                      | `xsetroot` / `xset` (root-window color, disable blanking)                            |
| `fonts-noto`, `fonts-noto-color-emoji`   | Crisp text + emoji (default fonts are thin)                                          |
| `tigervnc-standalone-server`             | `Xtigervnc` — the headless X/VNC server                                              |
| `tigervnc-common`                        | Shared TigerVNC files (`tigervncserver` wrapper)                                     |
| `novnc`                                  | HTML5 VNC client served from `/usr/share/novnc` (ships `vnc.html`)                   |
| `python3-websockify`                     | Provides `/usr/bin/websockify` (the HTML + WS proxy)                                 |
| `python3-numpy`                          | websockify HyBi fast-path (smoother, lower-CPU WebSocket)                            |
| `git`, `curl`, `ca-certificates`, `nano` | Minimal in-desktop basics only                                                       |
| `sudo`                                   | Passwordless `sudo` for the `desklink` user                                          |

A non-root **`desklink`** user (uid 1001) runs the session and has passwordless
`sudo`. The image `EXPOSE`s **6080**.

### Plasma-over-Xvnc gotchas (why this image actually works)

1. **`kwin-x11` must be installed explicitly.** It is only a *recommend* of
   `kde-plasma-desktop`, so `--no-install-recommends` would omit the window
   manager — leaving Plasma with no window borders / no window management. This
   is the #1 trap; it's in the apt list for exactly this reason. (Identical
   recommend-only trap on Debian and Ubuntu.)
2. **`sddm` is a *recommend*, so `--no-install-recommends` correctly leaves it
   out** — we want no login manager; the VNC session autostarts Plasma.
3. **Plasma needs its own D-Bus session bus**, or `plasmashell` segfaults on
   connect ("Plasma closed unexpectedly"). `xstartup` launches the whole session
   under `dbus-run-session` (fresh bus + exported `DBUS_SESSION_BUS_ADDRESS`),
   after unsetting any inherited bus.
4. **`XDG_RUNTIME_DIR` must exist at `0700`.** There's no systemd/elogind to
   create `/run/user/<uid>`, so `start.sh` and `xstartup` both provision
   `/tmp/runtime-desklink` (mkdir + chmod 700).
5. **`XDG_SESSION_TYPE=x11`** (not Wayland) and **`XDG_CURRENT_DESKTOP=KDE`** so
   Plasma starts the X11 session and apps/portals identify the DE.
6. **Software GL** (`LIBGL_ALWAYS_SOFTWARE=1`) for any stray GL client, since
   there's no GPU — belt-and-suspenders alongside compositing-off.

### Resource budget (4 GiB container)

- **Idle RAM:** ~**0.9–1.3 GiB** for Plasma 5.27 with compositing disabled and
  no apps open (plasmashell + kwin_x11 + kded/baloo + Xtigervnc). Comfortably
  under the 4 GiB cap, leaving ~2.5–3 GiB for Firefox/apps. Tip: `baloo` file
  indexing can be disabled to shave RAM if needed (`balooctl disable`).
- **Image size (uncompressed):** ~**2.2–2.8 GiB** (Debian base + Plasma + KDE
  apps + Firefox ESR + fonts). The Debian base layer is slightly smaller than
  Ubuntu's, so the final image tends to be marginally leaner. This is an
  **estimate** — the image is not built in this authoring environment; measure
  with `docker images` after a real build.

> **Deliberately NOT here (yet):** the "batteries" — [Install Doctor](https://install.doctor)
> provisioning, the Superset app bundle, and the broader application superset —
> are a **later ROADMAP fire**, kept out to keep the base image lean and usable
> on a 4 GiB container. See **Roadmap** below.

---

## Build & run locally

No daemon is assumed in CI — build on a machine with Docker:

```bash
cd container/debian

# Build for linux/amd64 (what Cloudflare Containers runs).
docker build --platform linux/amd64 -t deskl-debian .

# Run and expose the browser port.
docker run --rm -p 6080:6080 deskl-debian

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
| `VNC_PORT`        | `5901`                  | Xtigervnc RFB port (`5900 + display`) |
| `NOVNC_PORT`      | `6080`                  | Browser-facing websockify port        |
| `NOVNC_WEB`       | `/usr/share/novnc`      | noVNC HTML web root                   |
| `XDG_RUNTIME_DIR` | `/tmp/runtime-desklink` | Plasma/KWin private socket dir (0700) |

Example: `docker run --rm -p 6080:6080 -e VNC_RESOLUTION=1280x800 deskl-debian`

---

## Files in this directory

- **`Dockerfile`** — `FROM --platform=linux/amd64 debian:12`; installs the lean
  Plasma package set in one cleaned layer, creates the `desklink` user, copies
  the brand config + wallpaper, symlinks noVNC's `index.html`, `EXPOSE 6080`,
  `ENTRYPOINT` → `start.sh`.
- **`start.sh`** — entrypoint (identical to Ubuntu): preps the session +
  `XDG_RUNTIME_DIR`, starts `Xtigervnc` on `:1` (loopback-only, no password),
  waits for the RFB port, then runs `websockify` in the foreground as PID 1.
  Traps `SIGTERM`/`SIGINT` for a clean session teardown.
- **`xstartup`** — run by Xtigervnc on `:1` (identical to Ubuntu): sets up the
  fresh D-Bus session + XDG env, paints the deskl.ink near-black (`#05060A`)
  backdrop, disables screen blanking/DPMS, and `exec`s
  `dbus-run-session -- startplasma-x11`.
- **`config/`** — pre-baked KDE config (`kdeglobals`, `kwinrc`,
  `plasma-org.kde.plasma.desktop-appletsrc`, `kscreenlockerrc`, `kwalletrc`, and
  `autostart/deskl-theme.desktop` + `deskl-apply-theme.sh`) → copied to
  `~/.config/`.
- **`assets/wallpaper-05060A.png`** — 1920×1080 dark fallback wallpaper.
- **`README.md`** — this file.

---

## Roadmap (deferred to later fires)

These are intentionally **out of scope** for this base image and tracked for
later ROADMAP fires:

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
