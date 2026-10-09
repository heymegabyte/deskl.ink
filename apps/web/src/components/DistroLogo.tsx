import type { DistroId } from '@deskl/shared';

/**
 * FAITHFUL reconstructions of the official Linux distribution marks, drawn as crisp inline
 * SVG (vector = sharp at any size). These are trademarks used NOMINATIVELY — solely to
 * identify each distribution to the user — not an endorsement by, or affiliation with, their
 * owners:
 *   • Ubuntu "Circle of Friends" — trademark of Canonical Ltd.
 *   • Fedora logo — trademark of Red Hat, Inc.
 *   • Debian "swirl" (Debian Open Use Logo) — trademark of Software in the Public Interest, Inc.
 * Each mark sits on its brand disc so it reads on the dark glass UI.
 */

type DistroGlyph = (keyProp: string) => React.ReactNode;

/** Ubuntu — the "Circle of Friends": orange roundel, three white dots joined by arcs. */
const UbuntuGlyph: DistroGlyph = () => {
  const brand = '#E95420';
  // Three "friends" at 12, 4 and 8 o'clock around a central ring (the classic layout).
  const dots: ReadonlyArray<readonly [number, number]> = [
    [24, 7], // top
    [38.7, 32.5], // lower-right
    [9.3, 32.5], // lower-left
  ];
  return (
    <>
      <circle cx="24" cy="24" r="23" fill={brand} />
      {/* Connecting ring the friends sit on */}
      <circle cx="24" cy="24" r="12.5" fill="none" stroke="#fff" strokeWidth="3.4" />
      {/* Mask out the ring behind each dot so the dots read as separate "people" */}
      {dots.map(([cx, cy], i) => (
        <circle key={`gap-${i}`} cx={cx} cy={cy} r="7.4" fill={brand} />
      ))}
      {dots.map(([cx, cy], i) => (
        <circle key={`dot-${i}`} cx={cx} cy={cy} r="4.9" fill="#fff" />
      ))}
    </>
  );
};

/** Fedora — the infinity/"f" mark, white glyph on the brand-blue disc. */
const FedoraGlyph: DistroGlyph = () => (
  <>
    <circle cx="24" cy="24" r="23" fill="#3C6EB4" />
    {/* The "f": vertical stem with a top hook and a crossbar, per the official mark. */}
    <path
      d="M31 13.4c-2.2-1.5-4.9-1.9-7.4-1.2-3.2 1-5.3 4-5.3 7.4v3.2h-3.6v6.1h3.6v10.9h6.4V28.9h5.1l1-6.1h-6.1v-2.6c0-1.6 1-2.7 2.6-2.7 1 0 1.9.3 2.6.8l1.1-4.9z"
      fill="#fff"
    />
  </>
);

/** Debian — the "swirl" (Open Use Logo) in Debian red, on a subtle dark disc for contrast. */
const DebianGlyph: DistroGlyph = () => (
  <>
    <circle cx="24" cy="24" r="23" fill="#1A0A10" />
    {/* The open spiral — a comma/teardrop curl, the recognizable Debian mark. */}
    <path
      d="M30.6 24.3c.1 6.4-4.9 8.6-7.5 8.7 2.3-1.4 3.1-4.1 3-6.9-.1-3.4-2.3-6.5-6-7-4.5-.6-8 2.9-8 7.3 0 6.6 5.3 10.5 11.4 10.5 7.4 0 11.8-4.8 11.8-11 0-7.5-6-13-13.4-13-8.4 0-14.4 6.4-14.4 14.6l1.5.1c.1-7.3 5.2-12.9 12.6-12.9 6.6 0 11.7 4.9 11.7 11.5z"
      fill="#D70A53"
    />
  </>
);

const GLYPHS: Readonly<Record<DistroId, DistroGlyph>> = {
  ubuntu: UbuntuGlyph,
  fedora: FedoraGlyph,
  debian: DebianGlyph,
};

/**
 * Authentic distro mark for the given `distro`, rendered as crisp vector SVG that stays sharp
 * at any `size`.
 *
 * DECORATIVE BY DEFAULT (`aria-hidden`, no accessible name): almost everywhere this logo sits
 * beside the distro's name as visible text (OS picker, desktop tiles, tab strip), so giving the
 * SVG its own `aria-label` would make a screen reader announce the name twice ("Ubuntu … Ubuntu").
 *
 * Pass `label` ONLY in icon-only contexts where the distro name is NOT already visible text — it
 * promotes the SVG to `role="img"` + `aria-label={label}` so the mark gets announced exactly once.
 */
export function DistroLogo({
  distro,
  size = 32,
  className,
  label,
}: {
  distro: DistroId;
  size?: number;
  className?: string;
  /** Standalone accessible name for icon-only use. Omit when adjacent visible text names the distro. */
  label?: string;
}) {
  const Glyph = GLYPHS[distro];
  const labelled = label != null && label !== '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      {...(labelled ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={className}
    >
      {Glyph(distro)}
    </svg>
  );
}
