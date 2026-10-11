/**
 * User DEFAULTS for the New-computer flow — the distro + size a fresh "New computer" starts on.
 *
 * Persisted client-side in `localStorage['desklink:defaults']` as `{ distro, size }`. One definition,
 * imported by BOTH the Settings modal (writes) and the OsPicker (reads to pre-seed its state) — so the
 * two can never drift on key name or validation. We validate every stored value against the shared
 * `DISTRO_IDS` / `DESKTOP_SIZE_IDS` enums before trusting it, so a stale / hand-edited / partially-
 * written entry falls back cleanly to the golden path (Ubuntu · Everyday) instead of mis-seeding the
 * picker with an id the backend no longer offers. Mirrors the app's existing localStorage convention
 * (versioned key, JSON value, try/catch-guarded — see `App.tsx` OPEN_TABS_KEY).
 */
import {
  DISTRO_IDS,
  DESKTOP_SIZE_IDS,
  type DistroId,
  type DesktopSizeId,
} from '@deskl/shared';

/** localStorage key for the New-computer defaults (the product-wide `desklink:*` namespace). */
export const DEFAULTS_KEY = 'desklink:defaults';

/** The golden-path defaults — what a brand-new account (or a cleared / invalid entry) gets. */
export const FALLBACK_DEFAULTS: ComputerDefaults = { distro: 'ubuntu', size: 'everyday' };

/** The persisted New-computer defaults. */
export interface ComputerDefaults {
  distro: DistroId;
  size: DesktopSizeId;
}

/** Type guard: is `v` a valid distro id the UI + backend still offer? */
function isDistroId(v: unknown): v is DistroId {
  return typeof v === 'string' && (DISTRO_IDS as readonly string[]).includes(v);
}

/** Type guard: is `v` a valid size id the UI + backend still offer? */
function isSizeId(v: unknown): v is DesktopSizeId {
  return typeof v === 'string' && (DESKTOP_SIZE_IDS as readonly string[]).includes(v);
}

/**
 * Read the saved defaults, VALIDATED. Any missing / malformed / stale field independently falls back
 * to the golden path, so the result is always a fully-valid {@link ComputerDefaults} (never throws —
 * tolerates SSR / disabled storage / corrupt JSON exactly like the app's other localStorage reads).
 */
export function readDefaults(): ComputerDefaults {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEFAULTS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      return {
        distro: isDistroId(o['distro']) ? o['distro'] : FALLBACK_DEFAULTS.distro,
        size: isSizeId(o['size']) ? o['size'] : FALLBACK_DEFAULTS.size,
      };
    }
  } catch {
    /* no storage / bad JSON → golden path */
  }
  return { ...FALLBACK_DEFAULTS };
}

/**
 * Persist the New-computer defaults. Validates BOTH ids before writing (an invalid id is coerced to
 * the fallback rather than stored), so what lands in localStorage is always applicable. Swallows a
 * storage exception (quota / private mode) — a failed preference write must never break the UI.
 */
export function writeDefaults(next: ComputerDefaults): void {
  const safe: ComputerDefaults = {
    distro: isDistroId(next.distro) ? next.distro : FALLBACK_DEFAULTS.distro,
    size: isSizeId(next.size) ? next.size : FALLBACK_DEFAULTS.size,
  };
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(safe));
  } catch {
    /* storage unavailable — keep the in-memory choice; nothing else to do */
  }
}
