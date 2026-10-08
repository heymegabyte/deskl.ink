/**
 * Compute catalog — the ONE place that maps product concepts (distro, form, size) to the
 * Cloudflare runtime primitives a `Computer` Durable Object boots with. Keeping this central
 * is the spec's "maintain a central OS/Image Catalog; do not scatter version strings."
 *
 *   - `imageKeyFor(distro, form)` → a key in the wrangler `images` map on the Computer app
 *     (e.g. "ubuntu-desktop"). The DO resolves it to an image via `ctx.container.images[key]`.
 *   - `instanceFor(size)`        → the Cloudflare instance size ("standard-1".."standard-4"),
 *     the REAL RAM tier (4/6/8/12 GiB) — not a cosmetic label.
 *
 * Today only the `desktop` form has images built (container/{ubuntu,fedora,debian}/Dockerfile).
 * The `server` form (headless, browser-terminal only) is reserved here so adding it later is a
 * catalog entry + a Dockerfile + one wrangler `images` line — no control-plane changes.
 */

import { DESKTOP_SIZES, type DesktopSizeId, type DistroId } from '@deskl/shared';

/** The form factor of a computer. `desktop` = full GUI over VNC; `server` = headless (future). */
export type ComputerForm = 'desktop' | 'server';

/** Keys currently declared in the wrangler `images` map on the Computer container app. */
export const IMAGE_KEYS = ['ubuntu-desktop', 'fedora-desktop', 'debian-desktop'] as const;
export type ImageKey = (typeof IMAGE_KEYS)[number];

/** Cloudflare instance size identifiers the Computer DO may request at runtime. */
export type InstanceType = DesktopSizeId extends string
  ? 'standard-1' | 'standard-2' | 'standard-3' | 'standard-4'
  : never;

/**
 * Resolve the container image a (distro, form) runs. Only `desktop` images exist today, so an
 * unbuilt form falls back to the distro's desktop image rather than failing a boot — callers that
 * can't yet honor `server` still get a working computer.
 */
export function imageKeyFor(distro: DistroId, form: ComputerForm = 'desktop'): ImageKey {
  const candidate = `${distro}-${form}`;
  return (IMAGE_KEYS as readonly string[]).includes(candidate)
    ? (candidate as ImageKey)
    : (`${distro}-desktop` as ImageKey);
}

/** Resolve the Cloudflare instance size (real RAM tier) for a friendly size id. */
export function instanceFor(size: DesktopSizeId): InstanceType {
  return DESKTOP_SIZES[size].instanceType;
}
