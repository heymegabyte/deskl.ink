/**
 * deskl.ink brand mark.
 *
 * Concept: a rounded "desktop screen" framed in a cyan→violet gradient edge, with a cyan
 * `>_` terminal prompt inside — the operable Linux workstation / dev-agent idea, legible
 * from a 16px favicon to a hero. One mark, themeable, crisp at any size.
 */

interface LogoMarkProps {
  /** Rendered width/height in px. */
  size?: number;
  className?: string;
  /** Accessible label; set '' when paired with a visible wordmark (decorative). */
  title?: string;
  /** Unique gradient id when multiple marks render on one page. */
  idSuffix?: string;
}

export function LogoMark({
  size = 32,
  className,
  title = 'deskl.ink',
  idSuffix = '',
}: LogoMarkProps) {
  const gid = `deskl-logo-grad${idSuffix}`;
  const decorative = title === '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00E5FF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* the desktop screen */}
      <rect
        x="2.5"
        y="4"
        width="27"
        height="24"
        rx="6"
        fill="#0A0C12"
        stroke={`url(#${gid})`}
        strokeWidth="2"
      />
      {/* terminal prompt: chevron > */}
      <path
        d="M10 12.8 L14.2 16 L10 19.2"
        stroke="#00E5FF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* cursor underscore _ */}
      <path d="M16.5 19.2 H22" stroke="#00E5FF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

interface WordmarkProps {
  /** Mark size in px. */
  size?: number;
  /** Tailwind text-size class for the wordmark text. */
  textClassName?: string;
  className?: string;
  idSuffix?: string;
}

/** Icon mark + "deskl.ink" lockup (the `.ink` in brand cyan). Single-line, never wraps. */
export function Wordmark({
  size = 28,
  textClassName = 'text-lg',
  className,
  idSuffix = '-wm',
}: WordmarkProps) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} title="" idSuffix={idSuffix} className="shrink-0" />
      <span className={`truncate font-display font-700 tracking-tight text-white ${textClassName}`}>
        deskl<span className="text-[var(--color-cyan)]">.ink</span>
      </span>
    </span>
  );
}
