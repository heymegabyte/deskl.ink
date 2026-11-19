import { useState } from 'react';
import { Card } from './Card';
import {
  cn,
  computeSparklineScrubPoint,
  computeSynchronizedShimmerDelay,
  interpolateOdometerDigits,
} from './tt-physics';

export interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  loading?: boolean;
  interactive?: boolean;
  ripple?: boolean;
  sparklineValues?: readonly number[];
  onClick?: () => void;
  className?: string;
}

/**
 * A `@theme.tools/ui` labelled metric tile (label · value · optional delta), built on
 * Card with hover elevation, tactile click ripple, tabular odometer digits (MI10),
 * magnetic sparkline scrub (MI16), and viewport-synchronized loading shimmer (MI19).
 */
export function StatCard({
  label,
  value,
  delta,
  loading = false,
  interactive = true,
  ripple = true,
  sparklineValues,
  onClick,
  className,
}: StatCardProps) {
  const odometerDigits = interpolateOdometerDigits(value);
  const numericDigitCount = odometerDigits.filter((d) => d.isNumeric).length;
  const shimmerSync = computeSynchronizedShimmerDelay(180, 1280);
  const [scrubDelta, setScrubDelta] = useState<string | null>(null);
  return (
    <Card
      role="region"
      aria-label={label}
      data-testid="stat-card"
      data-odometer-value={value}
      data-odometer-digits={numericDigitCount}
      data-sparkline-values={sparklineValues ? sparklineValues.join(',') : undefined}
      data-interaction-state={loading ? 'loading' : scrubDelta ? 'hovered' : 'rest'}
      loading={loading}
      interactive={interactive || Boolean(onClick)}
      ripple={ripple}
      onClick={onClick}
      onPointerMove={(e) => {
        if (sparklineValues && sparklineValues.length > 0) {
          const rect = e.currentTarget.getBoundingClientRect?.();
          if (rect && rect.width > 0) {
            const pt = computeSparklineScrubPoint(
              sparklineValues,
              (e.clientX - rect.left) / rect.width,
              rect.width
            );
            setScrubDelta(
              `${pt.deltaPercentFromStart >= 0 ? '+' : ''}${pt.deltaPercentFromStart}%`
            );
          }
        }
      }}
      onPointerLeave={() => {
        if (scrubDelta !== null) setScrubDelta(null);
      }}
      className={cn(
        'group relative overflow-hidden p-4 transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-md',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/55 to-accent/0 opacity-0 transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-primary/65 ring-2 ring-primary/15 transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-125 group-hover:bg-primary group-hover:ring-primary/30"
        />
      </div>
      {loading ? (
        <div
          className="mt-2 space-y-1.5"
          aria-hidden="true"
          style={{ '--tt-shimmer-delay': shimmerSync.cssDelayValue } as React.CSSProperties}
        >
          <div className="tt-shimmer h-5 w-24 rounded bg-muted" />
          <div className="tt-shimmer h-3 w-32 rounded bg-muted/70" />
        </div>
      ) : (
        <>
          <div className="tt-odometer-value mt-1 font-display text-lg font-bold tabular-nums text-card-foreground">
            {value}
          </div>
          {(scrubDelta ?? delta) ? (
            <div className="mt-0.5 font-mono text-xs font-medium tabular-nums text-primary">
              {scrubDelta ?? delta}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
