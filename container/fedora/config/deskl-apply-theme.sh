#!/bin/sh
# -----------------------------------------------------------------------------
# deskl.ink — re-assert the dark, on-brand Plasma look AFTER plasmashell is up.
# -----------------------------------------------------------------------------
# plasmashell REGENERATES its appletsrc/wallpaper on first run, overwriting the
# pre-baked config (observed: it reverted to the default mountain wallpaper). The
# reliable fix is to apply the look LIVE via the plasma-apply-* tools once the
# shell is running — run from ~/.config/autostart as KDE autostart phase 2.
# Plasma first-run over software VNC is slow, so retry until the wallpaper apply
# succeeds (that call only works once plasmashell's D-Bus iface is up).
#
# The plasma-apply-lookandfeel / -colorscheme / -wallpaperimage tool NAMES are
# unchanged between Plasma 5 and Plasma 6, so this runs identically on Fedora 41
# (Plasma 6) and Ubuntu noble (Plasma 5). The only Plasma-6 difference is the
# kwriteconfig binary: Plasma 6 ships kwriteconfig6 (Qt6); we prefer it and fall
# back to kwriteconfig5 where only the Plasma-5 binary exists.
# -----------------------------------------------------------------------------
WP="$HOME/.local/share/wallpapers/deskl-dark/contents/images/1920x1080.png"

sleep 10   # give plasmashell a head start (first-run shell init over VNC)

n=0
while [ "$n" -lt 10 ]; do
  # Dark Breeze look-and-feel + color scheme (dark, intentional).
  plasma-apply-lookandfeel -a org.kde.breezedark.desktop >/dev/null 2>&1 || true
  plasma-apply-colorscheme BreezeDark >/dev/null 2>&1 || true
  # Wallpaper LAST (a look-and-feel change can reset it). Break when it sticks —
  # a success means plasmashell is up and accepted the near-black wallpaper.
  if plasma-apply-wallpaperimage "$WP" >/dev/null 2>&1; then
    break
  fi
  n=$((n + 1))
  sleep 4
done

# Final re-assert + cyan (#00E5FF) accent. Plasma 6 → kwriteconfig6; fall back to
# kwriteconfig5 (Plasma 5) so the accent still writes on either stack.
plasma-apply-wallpaperimage "$WP" >/dev/null 2>&1 || true
if command -v kwriteconfig6 >/dev/null 2>&1; then
  kwriteconfig6 --file kdeglobals --group General --key AccentColor "0,229,255" >/dev/null 2>&1 || true
elif command -v kwriteconfig5 >/dev/null 2>&1; then
  kwriteconfig5 --file kdeglobals --group General --key AccentColor "0,229,255" >/dev/null 2>&1 || true
fi
