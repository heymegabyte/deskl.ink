/**
 * deskl.ink design tokens — the typed visual language.
 *
 * Direction: deep-space black, electric cyan, violet accent, restrained white.
 * Glass + bloom + grain over a living cyan/violet nebula. Cinematic, premium,
 * slightly surreal — "a desktop for you, a computer for your AI."
 *
 * Every value is a plain `as const` constant so it can drive both runtime code
 * and the Tailwind v4 `@theme` mapping in apps/web/src/index.css. Keep this file
 * free of framework imports — it is the lowest layer.
 */

/** Core brand palette. Hex strings so they drop straight into CSS vars. */
export const colors = {
  /** Primary background — near-black with a faint blue cast. */
  black: '#05060A',
  /** Raised surfaces (panels, cards) sitting above `black`. */
  nearBlack: '#0A0C12',
  /** Elevated glass surface tint. */
  surface: '#10131C',
  /** Hairline borders / dividers on dark. */
  border: '#1C2230',
  /** Signature electric cyan — primary accent, CTAs, focus. */
  cyan: '#00E5FF',
  /** Dimmed cyan for secondary accents, hovers, chart fills. */
  cyanDim: '#1FA8C4',
  /** Violet secondary accent — gradients, AI-native surfaces. */
  violet: '#7C3AED',
  /** Restrained near-white for primary text (never pure #FFF). */
  white: '#F5F7FA',
  /** Muted text / captions. */
  muted: '#8A93A6',
  /** Success / ready state. */
  success: '#2ED47A',
  /** Warning / restoring state. */
  warning: '#F5A623',
  /** Danger / failed state. */
  danger: '#FF5C6C',
} as const;

/** 4px-based spacing scale (rem units). */
export const spacing = {
  px: '1px',
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
} as const;

/** Corner radii. */
export const radii = {
  none: '0',
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.75rem',
  full: '9999px',
} as const;

/** Glass / blur surface tokens for the layered black-cyan aesthetic. */
export const glass = {
  /** Backdrop blur radii. */
  blurSm: '8px',
  blurMd: '16px',
  blurLg: '28px',
  /** Translucent fills layered over the nebula. */
  fillLow: 'rgba(16, 19, 28, 0.55)',
  fillMid: 'rgba(16, 19, 28, 0.72)',
  fillHigh: 'rgba(10, 12, 18, 0.86)',
  /** Hairline edge highlight for glass panels. */
  edge: 'rgba(0, 229, 255, 0.14)',
} as const;

/** Bloom / shadow tokens — soft cyan glow + depth. */
export const bloom = {
  /** Cyan glow for focus rings and active CTAs. */
  cyanSoft: '0 0 0 1px rgba(0, 229, 255, 0.35), 0 0 24px rgba(0, 229, 255, 0.25)',
  cyanStrong: '0 0 0 1px rgba(0, 229, 255, 0.6), 0 0 40px rgba(0, 229, 255, 0.4)',
  violetSoft: '0 0 32px rgba(124, 58, 237, 0.35)',
  /** Neutral elevation shadows. */
  elevation1: '0 1px 2px rgba(0, 0, 0, 0.4)',
  elevation2: '0 8px 24px rgba(0, 0, 0, 0.45)',
  elevation3: '0 24px 64px rgba(0, 0, 0, 0.55)',
} as const;

/** Motion durations (ms) and easing curves. */
export const motion = {
  duration: {
    instant: '80ms',
    fast: '160ms',
    base: '240ms',
    slow: '420ms',
    cinematic: '720ms',
  },
  easing: {
    /** Standard productive ease. */
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    /** Decelerate — things entering. */
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    /** Accelerate — things leaving. */
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    /** Expressive spring-like overshoot for hero/dismiss. */
    expressive: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

/** Font stacks. Sora (display), Space Grotesk (UI), JetBrains Mono (code). */
export const fonts = {
  display: "'Sora', system-ui, -apple-system, 'Segoe UI', sans-serif",
  sans: "'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
} as const;

/** Fluid type scale using clamp() for cinematic headings. */
export const typeScale = {
  caption: 'clamp(0.75rem, 0.72rem + 0.15vw, 0.8125rem)',
  body: 'clamp(0.9375rem, 0.9rem + 0.2vw, 1rem)',
  lead: 'clamp(1.0625rem, 1rem + 0.4vw, 1.25rem)',
  h3: 'clamp(1.25rem, 1.1rem + 0.8vw, 1.75rem)',
  h2: 'clamp(1.75rem, 1.4rem + 1.6vw, 2.75rem)',
  h1: 'clamp(2.5rem, 1.9rem + 3vw, 4.5rem)',
} as const;

/** z-index scale — keeps the overlay/app/nebula layering unambiguous. */
export const zIndex = {
  nebula: 0,
  app: 10,
  overlayScrim: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
} as const;

/** The whole token set, grouped. Handy for a single import. */
export const tokens = {
  colors,
  spacing,
  radii,
  glass,
  bloom,
  motion,
  fonts,
  typeScale,
  zIndex,
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof colors;
