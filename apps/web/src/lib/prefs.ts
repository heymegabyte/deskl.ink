/**
 * User ACCESSIBILITY preferences — currently the "Reduce motion" override (Dim 28 reduced-motion
 * mode). Persisted client-side in `localStorage['desklink:reduce-motion']` as `'1'` (on) / `'0'`
 * (off), in the product-wide `desklink:*` namespace.
 *
 * This forces reduced motion ON regardless of the OS media query — it is purely ADDITIVE. The
 * system `@media (prefers-reduced-motion: reduce)` reset in `index.css` is always respected; this
 * lets a user who has NOT set the OS flag still minimize animations in-app. We only ever turn motion
 * DOWN, never back up over a system preference.
 *
 * One definition, imported by BOTH `App.tsx` (applies the pref on mount) and {@link SettingsModal}
 * (the toggle writes it + flips the attribute live) — so the two can never drift on key name or on
 * how the `<html data-reduce-motion>` attribute is set. Mirrors the app's localStorage convention
 * (namespaced key, try/catch-guarded — see `defaults.ts` / `App.tsx` OPEN_TABS_KEY).
 */

/** localStorage key for the reduce-motion override (the product-wide `desklink:*` namespace). */
export const REDUCE_MOTION_KEY = 'desklink:reduce-motion';

/**
 * Read the saved reduce-motion override. Defaults to `false` (OS media query still applies) for a
 * fresh / cleared / malformed entry. Never throws — tolerates SSR / disabled storage exactly like
 * the app's other localStorage reads.
 */
export function readReduceMotion(): boolean {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_KEY) === '1';
  } catch {
    /* no storage → default off (system preference still honored by the CSS @media block) */
    return false;
  }
}

/**
 * Persist the reduce-motion override. Swallows a storage exception (quota / private mode) — a failed
 * preference write must never break the UI; the in-memory state and the applied attribute still hold
 * for the session.
 */
export function writeReduceMotion(on: boolean): void {
  try {
    window.localStorage.setItem(REDUCE_MOTION_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — keep the applied state; nothing else to do */
  }
}

/**
 * Reflect the override onto the document root so the additive CSS rule
 * (`:root[data-reduce-motion="1"] …`) can clamp animations site-wide. Setting the attribute to `'1'`
 * arms the rule; clearing it (empty string) disarms it, falling back to the OS media query alone.
 * Shared by the mount effect and the Settings toggle so the live update and the persisted value use
 * the exact same mechanism. No-ops safely if there is no document (SSR).
 */
export function applyReduceMotion(on: boolean): void {
  try {
    document.documentElement.dataset.reduceMotion = on ? '1' : '';
  } catch {
    /* no document — nothing to reflect */
  }
}
