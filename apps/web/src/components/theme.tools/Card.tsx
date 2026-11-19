import { forwardRef, type HTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  cn,
  computeCursorSpotlight,
  computePerspectiveTiltGlare,
  detectHoverEntryQuadrant,
  spawnTactileRipple,
} from './tt-physics';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  loading?: boolean;
  ripple?: boolean;
  spotlight?: boolean;
  tilt?: boolean;
  /**
   * Render the card's styling + physics onto a single child element (shadcn pattern)
   * instead of a `<div>` — e.g. `<Card asChild interactive><Link to="…">…</Link></Card>`
   * keeps the anchor's navigation + semantics while inheriting the surface look, so a
   * clickable card stays a valid single `<a>` (no nested-interactive DOM). The child
   * must be a single element that accepts a className + ref. The `loading` progress bar
   * is only rendered in the non-`asChild` path (Slot requires exactly one child).
   */
  asChild?: boolean;
}

/**
 * A `@theme.tools/ui` surface container (`bg-card` + border) themed via the app's
 * OKLCH tokens — 333ms state transitions, optional click ripple (MI01), cursor
 * spotlight (MI01), directional hover quadrant (MI03), 3D perspective tilt + glare
 * (MI07), and an optional top loading progress sweep.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    className,
    interactive = false,
    loading = false,
    ripple,
    spotlight = true,
    tilt = false,
    asChild = false,
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onKeyDown,
    children,
    ...props
  },
  ref
) {
  const isInteractive = interactive || Boolean(props.onClick) || ripple === true;
  const shouldRipple = ripple !== undefined ? ripple && !loading : isInteractive && !loading;
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref as never}
      role={props.role ?? (props.onClick ? 'button' : undefined)}
      tabIndex={props.tabIndex ?? (isInteractive && props.onClick ? 0 : undefined)}
      aria-busy={loading || undefined}
      data-ripple={shouldRipple ? 'true' : undefined}
      data-spotlight={spotlight ? 'true' : undefined}
      data-tilt={tilt ? 'true' : undefined}
      data-interaction-state={loading ? 'loading' : 'rest'}
      onPointerDown={(e) => {
        if (shouldRipple && e.button === 0) {
          const targetEl = e.target as HTMLElement;
          const nestedButton = targetEl?.closest?.(
            'button, [role="button"], [role="tab"], [role="switch"], a, input, select, textarea'
          );
          if (!nestedButton || nestedButton === e.currentTarget) {
            spawnTactileRipple(e.currentTarget, { clientX: e.clientX, clientY: e.clientY });
          }
        }
        onPointerDown?.(e);
      }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect?.();
        if (rect && rect.width > 0) {
          if (spotlight) {
            const spot = computeCursorSpotlight(e.clientX, e.clientY, rect);
            e.currentTarget.style?.setProperty('--tt-spot-x', `${spot.xPx}px`);
            e.currentTarget.style?.setProperty('--tt-spot-y', `${spot.yPx}px`);
          }
          e.currentTarget.setAttribute(
            'data-entry-quadrant',
            detectHoverEntryQuadrant(e.clientX, e.clientY, rect).quadrant
          );
          if (tilt) {
            const t = computePerspectiveTiltGlare(e.clientX, e.clientY, rect);
            e.currentTarget.style?.setProperty('--tt-tilt-rx', `${t.rotateXDeg}deg`);
            e.currentTarget.style?.setProperty('--tt-tilt-ry', `${t.rotateYDeg}deg`);
            e.currentTarget.style?.setProperty('--tt-glare-x', `${t.glareXPercent}%`);
            e.currentTarget.style?.setProperty('--tt-glare-y', `${t.glareYPercent}%`);
          }
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        if (tilt) {
          e.currentTarget.style?.setProperty('--tt-tilt-rx', '0deg');
          e.currentTarget.style?.setProperty('--tt-tilt-ry', '0deg');
        }
        onPointerLeave?.(e);
      }}
      onKeyDown={(e) => {
        if (
          shouldRipple &&
          !e.repeat &&
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          spawnTactileRipple(e.currentTarget, { clientX: 0, clientY: 0 });
        }
        onKeyDown?.(e);
      }}
      className={cn(
        'relative rounded-xl border border-border/90 bg-card/95 text-card-foreground shadow-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-2xs transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border has-[input:focus-visible,select:focus-visible,textarea:focus-visible]:border-primary/55 has-[input:focus-visible,select:focus-visible,textarea:focus-visible]:ring-2 has-[input:focus-visible,select:focus-visible,textarea:focus-visible]:ring-primary/15',
        isInteractive &&
          'tt-spring-press overflow-hidden cursor-pointer hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-md active:translate-y-0 active:scale-[0.992]',
        className
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl bg-primary/15"
            >
              <div className="tt-progress-sweep h-full w-1/2 bg-primary" />
            </div>
          )}
          {children}
        </>
      )}
    </Comp>
  );
});
