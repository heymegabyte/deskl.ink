import { cn } from './tt-physics';

/** The `@theme.tools/ui` orbital loading spinner (from `foundation/states`). */
export function OrbitalLoadingSpinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('tt-orbital-spin shrink-0 text-primary', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="3" r="1.5" fill="currentColor" />
    </svg>
  );
}
