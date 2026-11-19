/**
 * Tactile micro-interaction physics for the vendored `@theme.tools/ui` primitives.
 *
 * Byte-faithful extraction of the pure helpers the 5 primitives
 * (Button/Card/Input/Badge/StatCard) consume, from `@theme-tools/ui`
 * `dist/foundation/{dom-interaction-physics,micro-interactions-30}.js`
 * (heymegabyte/theme.tools, MIT). Only the functions actually used are vendored —
 * the upstream modules also carry unrelated CDN-image + social-platform concerns
 * that this app does not need.
 */

/** Join class names, dropping falsy values (the `@theme-tools/shared-utils` `cn`). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const EXCLUDED_RIPPLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

function isRippleWelcomeTarget(target: HTMLElement): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? '').toUpperCase();
  if (EXCLUDED_RIPPLE_TAGS.has(tag)) return false;
  if ((target as HTMLButtonElement).disabled === true) return false;
  const getAttr =
    typeof target.getAttribute === 'function' ? target.getAttribute.bind(target) : () => null;
  if (getAttr('data-ripple') === 'false') return false;
  if (getAttr('disabled') !== null) return false;
  if (getAttr('aria-disabled') === 'true') return false;
  if (getAttr('aria-busy') === 'true') return false;
  if (getAttr('contenteditable') === 'true') return false;
  if (getAttr('data-variant') === 'link') return false;
  return true;
}

interface RippleGeometry {
  readonly sizePx: number;
  readonly leftPx: number;
  readonly topPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly durationMs: number;
  readonly centeredFallback: boolean;
}

/** MI01 — furthest-corner radial ripple geometry (coordinate-accurate). */
export function computeCursorRippleGeometry(
  clientX: number,
  clientY: number,
  rect: RectLike
): RippleGeometry {
  const safeW = Math.max(0, rect.width);
  const safeH = Math.max(0, rect.height);
  const isKeyboardCenter =
    (clientX === 0 && clientY === 0) || !Number.isFinite(clientX) || !Number.isFinite(clientY);
  const originX = isKeyboardCenter ? safeW / 2 : clientX - rect.left;
  const originY = isKeyboardCenter ? safeH / 2 : clientY - rect.top;
  const distX = Math.max(originX, safeW - originX);
  const distY = Math.max(originY, safeH - originY);
  const furthestCornerRadius = Math.hypot(distX, distY);
  const sizePx = Number(
    Math.max(Math.max(safeW, safeH) * 1.6, furthestCornerRadius * 2).toFixed(2)
  );
  return {
    sizePx,
    leftPx: Number((originX - sizePx / 2).toFixed(2)),
    topPx: Number((originY - sizePx / 2).toFixed(2)),
    originX: Number(originX.toFixed(2)),
    originY: Number(originY.toFixed(2)),
    durationMs: 550,
    centeredFallback: isKeyboardCenter,
  };
}

/**
 * Spawn a one-shot tactile ripple inside `target` at the pointer coordinates
 * (keyboard activation → centered). No-op in SSR / headless and under
 * `prefers-reduced-motion`.
 */
export function spawnTactileRipple(
  target: HTMLElement,
  coordinates?: { clientX?: number; clientY?: number }
): RippleGeometry | null {
  if (!target || !isRippleWelcomeTarget(target)) return null;
  const now = Date.now();
  const prevTs = Number(target.getAttribute?.('data-tt-ripple-ts') ?? '0');
  if (now - prevTs < 24) return null;
  target.setAttribute?.('data-tt-ripple-ts', String(now));
  const rect: RectLike =
    typeof target.getBoundingClientRect === 'function'
      ? target.getBoundingClientRect()
      : { left: 0, top: 0, width: 120, height: 40 };
  const geom = computeCursorRippleGeometry(
    coordinates?.clientX ?? 0,
    coordinates?.clientY ?? 0,
    rect
  );
  if (target.style && typeof target.style.setProperty === 'function') {
    target.style.setProperty('--tt-ripple-x', `${geom.originX}px`);
    target.style.setProperty('--tt-ripple-y', `${geom.originY}px`);
    target.style.setProperty('--tt-ripple-size', `${geom.sizePx}px`);
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return geom;
  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    target.setAttribute('data-ripple-active', 'reduced');
    setTimeout(() => target.removeAttribute('data-ripple-active'), 180);
    return geom;
  }
  const ripple = document.createElement('span');
  ripple.setAttribute('data-cursor-ripple', '');
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.cssText = [
    'position:absolute',
    'border-radius:9999px',
    'pointer-events:none',
    `width:${geom.sizePx}px`,
    `height:${geom.sizePx}px`,
    `left:${geom.leftPx}px`,
    `top:${geom.topPx}px`,
    'background:radial-gradient(circle, color-mix(in oklch, currentColor 24%, var(--primary, currentColor) 16%) 0%, color-mix(in oklch, currentColor 10%, transparent) 52%, transparent 72%)',
    'opacity:0.26',
    'transform:scale(0)',
    `transition:transform ${geom.durationMs}ms cubic-bezier(0.22,1,0.36,1), opacity ${geom.durationMs}ms ease-out`,
  ].join(';');
  const computedPos =
    typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(target).position
      : target.style?.position;
  if (!computedPos || computedPos === 'static') target.style.position = 'relative';
  const isComponentShell =
    typeof target.hasAttribute === 'function' && target.hasAttribute('data-component');
  if (!isComponentShell && (!target.style.overflow || target.style.overflow === 'visible')) {
    target.style.overflow = 'hidden';
  }
  target.appendChild(ripple);
  const runExpand = () => {
    ripple.style.transform = 'scale(1)';
    ripple.style.opacity = '0';
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(runExpand);
  else runExpand();
  setTimeout(() => ripple.remove(), geom.durationMs + 50);
  return geom;
}

/** MI01 — cursor spotlight position inside a surface. */
export function computeCursorSpotlight(
  clientX: number,
  clientY: number,
  rect: RectLike,
  radiusPx = 280
): { xPx: number; yPx: number; opacity: number } {
  const xPx = Number((clientX - rect.left).toFixed(2));
  const yPx = Number((clientY - rect.top).toFixed(2));
  const inside =
    xPx >= -radiusPx &&
    xPx <= rect.width + radiusPx &&
    yPx >= -radiusPx &&
    yPx <= rect.height + radiusPx;
  return { xPx, yPx, opacity: inside ? 1 : 0 };
}

/** MI02 — magnetic target pull toward the cursor. */
export function computeMagneticPull(
  clientX: number,
  clientY: number,
  rect: RectLike,
  maxPullPx = 5,
  deadZoneRatio = 0.12
): { x: number; y: number; active: boolean } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0, active: false };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const nx = (clientX - cx) / (rect.width / 2);
  const ny = (clientY - cy) / (rect.height / 2);
  const dist = Math.hypot(nx, ny);
  if (dist < deadZoneRatio || dist > 1.35) return { x: 0, y: 0, active: false };
  const clampedX = Math.max(-1, Math.min(1, nx));
  const clampedY = Math.max(-1, Math.min(1, ny));
  return {
    x: Number((clampedX * maxPullPx).toFixed(2)),
    y: Number((clampedY * maxPullPx).toFixed(2)),
    active: true,
  };
}

type Quadrant = 'top' | 'right' | 'bottom' | 'left';

/** MI03 — directional hover entry quadrant. */
export function detectHoverEntryQuadrant(
  clientX: number,
  clientY: number,
  rect: RectLike
): { quadrant: Quadrant; entryX: number; entryY: number } {
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const x = (clientX - rect.left - w / 2) * (w > h ? h / w : 1);
  const y = (clientY - rect.top - h / 2) * (h > w ? w / h : 1);
  const angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
  const bucket = Math.round((angleDeg + 180) / 90 + 3) % 4;
  const quadrants: Quadrant[] = ['top', 'right', 'bottom', 'left'];
  const quadrant = quadrants[bucket] ?? 'top';
  const vectors: Record<Quadrant, { entryX: number; entryY: number }> = {
    top: { entryX: 0, entryY: -1 },
    right: { entryX: 1, entryY: 0 },
    bottom: { entryX: 0, entryY: 1 },
    left: { entryX: -1, entryY: 0 },
  };
  return { quadrant, ...vectors[quadrant] };
}

/** MI05 — morphing copy-to-clipboard checkmark state. */
export function computeCopyMorphState(
  copiedAtMs: number | null,
  nowMs: number,
  holdDurationMs = 1600
): { copied: boolean; statusLabel: string } {
  if (copiedAtMs === null || nowMs < copiedAtMs || nowMs - copiedAtMs > holdDurationMs) {
    return { copied: false, statusLabel: 'Copy' };
  }
  return { copied: true, statusLabel: 'Copied!' };
}

/** MI07 — 3D perspective tilt + opposing specular glare. */
export function computePerspectiveTiltGlare(
  clientX: number,
  clientY: number,
  rect: RectLike,
  maxDeg = 5
): { rotateXDeg: number; rotateYDeg: number; glareXPercent: number; glareYPercent: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { rotateXDeg: 0, rotateYDeg: 0, glareXPercent: 50, glareYPercent: 50 };
  }
  const px = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const py = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return {
    rotateXDeg: Number(((0.5 - py) * 2 * maxDeg).toFixed(2)),
    rotateYDeg: Number(((px - 0.5) * 2 * maxDeg).toFixed(2)),
    glareXPercent: Math.round((1 - px) * 100),
    glareYPercent: Math.round((1 - py) * 100),
  };
}

/** MI10 — tabular odometer rolling-digit model. */
export function interpolateOdometerDigits(formattedValue: string): Array<{
  index: number;
  char: string;
  isNumeric: boolean;
  digitValue: number;
  translateYPercent: number;
}> {
  return Array.from(formattedValue).map((char, index) => {
    const code = char.charCodeAt(0);
    const isNumeric = code >= 48 && code <= 57;
    const digitValue = isNumeric ? code - 48 : 0;
    return {
      index,
      char,
      isNumeric,
      digitValue,
      translateYPercent: isNumeric ? -digitValue * 10 : 0,
    };
  });
}

/** MI16 — sparkline scrubbing crosshair point. */
export function computeSparklineScrubPoint(
  values: readonly number[],
  pointerXRatio: number,
  widthPx = 200,
  heightPx = 48
): { index: number; value: number; xPx: number; yPx: number; deltaPercentFromStart: number } {
  if (values.length === 0) {
    return { index: 0, value: 0, xPx: 0, yPx: heightPx / 2, deltaPercentFromStart: 0 };
  }
  const clamped = Math.max(0, Math.min(1, pointerXRatio));
  const index = Math.min(values.length - 1, Math.round(clamped * (values.length - 1)));
  const value = values[index] ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xPx = Number(((index / Math.max(1, values.length - 1)) * widthPx).toFixed(2));
  const yPx = Number((heightPx - ((value - min) / span) * (heightPx - 8) - 4).toFixed(2));
  const first = values[0] || 1;
  const deltaPercentFromStart = Number((((value - first) / Math.abs(first)) * 100).toFixed(2));
  return { index, value, xPx, yPx, deltaPercentFromStart };
}

/** MI19 — skeleton shimmer phase synchronization. */
export function computeSynchronizedShimmerDelay(
  elementLeftPx: number,
  viewportWidthPx = 1280,
  cycleDurationMs = 1800
): { animationDelayMs: number; cssDelayValue: string } {
  const safeVw = Math.max(320, viewportWidthPx);
  const ratio = Math.max(0, Math.min(1, elementLeftPx / safeVw));
  const delayMs = -Math.round(ratio * cycleDurationMs * 0.65);
  return { animationDelayMs: delayMs, cssDelayValue: `${delayMs}ms` };
}

/** MI26 — button loading width lock (prevents layout jitter on label swap). */
export function computeLoadingDimensionsLock(
  loading: boolean,
  measuredWidthPx: number
): { minWidthPx: number | undefined } {
  return { minWidthPx: loading && measuredWidthPx > 0 ? measuredWidthPx : undefined };
}
