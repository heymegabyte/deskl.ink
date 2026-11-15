/** deskl.ink brand mark: a linked browser desktop in cyan, violet, white, and near-black. */

interface LogoMarkProps {
  /** Rendered width/height in px. */
  size?: number;
  className?: string;
  /** Accessible label; set '' when paired with a visible wordmark (decorative). */
  title?: string;
}

export function LogoMark({ size = 32, className, title = 'deskl.ink' }: LogoMarkProps) {
  const decorative = title === '';
  return (
    <img
      src="/brand/deskl-mark.webp"
      width={size}
      height={size}
      alt={decorative ? '' : title}
      aria-hidden={decorative ? true : undefined}
      decoding="async"
      className={`rounded-[22%] object-contain ${className ?? ''}`}
    />
  );
}

interface WordmarkProps {
  /** Mark size in px. */
  size?: number;
  /** Tailwind text-size class for the wordmark text. */
  textClassName?: string;
  className?: string;
}

/** Icon mark + "deskl.ink" lockup (the `.ink` in brand cyan). Single-line, never wraps. */
export function Wordmark({ size = 28, textClassName = 'text-lg', className }: WordmarkProps) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2.5 ${className ?? ''}`}>
      <LogoMark size={size} title="" className="shrink-0" />
      <span
        className={`truncate font-display font-800 tracking-[-0.04em] text-white ${textClassName}`}
      >
        deskl<span className="text-[var(--color-cyan)]">.ink</span>
      </span>
    </span>
  );
}
