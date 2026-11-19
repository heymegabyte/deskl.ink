import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useRef, useState } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { OrbitalLoadingSpinner } from './OrbitalLoadingSpinner';
import {
  cn,
  computeLoadingDimensionsLock,
  computeMagneticPull,
  detectHoverEntryQuadrant,
  spawnTactileRipple,
} from './tt-physics';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'accent' | 'ghost' | 'link' | 'default' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  shortcut?: string;
  ripple?: boolean;
  magnetic?: boolean;
  copyText?: string;
  holdToConfirmMs?: number;
  onHoldConfirm?: () => void;
  /**
   * Render the button's styling + physics onto a single child element (shadcn pattern)
   * instead of a `<button>` — e.g. `<Button asChild><Link to="…">…</Link></Button>`
   * keeps the anchor's navigation + semantics while inheriting the primitive look.
   * The child must be a single element that accepts a className + ref.
   */
  asChild?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'relative overflow-hidden bg-primary text-primary-foreground font-semibold shadow-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 active:translate-y-0 active:scale-[0.98]',
  default:
    'relative overflow-hidden bg-primary text-primary-foreground font-semibold shadow-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 active:translate-y-0 active:scale-[0.98]',
  secondary:
    'relative overflow-hidden border border-border/90 bg-secondary/95 text-secondary-foreground font-medium shadow-2xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:-translate-y-0.5 hover:border-primary/55 hover:bg-secondary hover:shadow-sm active:translate-y-0 active:scale-[0.98]',
  outline:
    'relative overflow-hidden border border-border bg-background/80 text-foreground font-medium shadow-2xs backdrop-blur-xs hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/8 hover:text-foreground hover:shadow-sm active:translate-y-0 active:scale-[0.98]',
  accent:
    'relative overflow-hidden bg-accent text-accent-foreground font-semibold shadow-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.16)] hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 active:translate-y-0 active:scale-[0.98]',
  destructive:
    'relative overflow-hidden bg-destructive text-destructive-foreground font-semibold shadow-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 active:translate-y-0 active:scale-[0.98]',
  ghost:
    'relative overflow-hidden text-foreground font-medium hover:bg-primary/10 hover:text-primary active:scale-[0.98]',
  link: 'tt-link-sweep text-primary font-medium underline-offset-4 hover:underline active:opacity-80',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

/**
 * Token-driven `@theme.tools/ui` button — 333ms spring transitions, coordinate-tracked
 * OKLCH radial click ripple (MI01), magnetic target pull (MI02), directional hover
 * quadrant (MI03), copy-to-clipboard checkmark morph (MI05), asymmetric spring press
 * (MI06), hold-to-confirm destructive progress (MI13), directional link sweep (MI25),
 * and loading width lock (MI26).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    shortcut,
    ripple,
    magnetic,
    copyText,
    holdToConfirmMs,
    onHoldConfirm,
    asChild = false,
    className,
    type = 'button',
    disabled,
    style,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerLeave,
    onKeyDown,
    onClick,
    children,
    ...props
  },
  ref
) {
  const isDisabled = Boolean(disabled || loading);
  const shouldRipple =
    ripple !== undefined ? ripple && !isDisabled : variant !== 'link' && !isDisabled;
  const isMagnetic = magnetic ?? (size === 'lg' && variant !== 'link' && !isDisabled);
  const [copied, setCopied] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingLock = computeLoadingDimensionsLock(loading, measuredWidth);
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref as never}
      {...(asChild ? { 'aria-disabled': isDisabled || undefined } : { type, disabled: isDisabled })}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-ripple={shouldRipple ? 'true' : 'false'}
      data-magnetic={isMagnetic ? 'true' : undefined}
      data-copy-text={copyText}
      data-copy-state={copyText ? (copied ? 'copied' : 'idle') : undefined}
      data-hold-confirm={holdToConfirmMs ? 'true' : undefined}
      data-loading-width-locked={loading && measuredWidth > 0 ? 'true' : undefined}
      data-interaction-state={
        loading ? 'loading' : isDisabled ? 'disabled' : copied ? 'selected' : 'rest'
      }
      style={{
        ...(loadingLock.minWidthPx ? { minWidth: `${loadingLock.minWidthPx}px` } : {}),
        ...style,
      }}
      onPointerDown={(e) => {
        if (e.currentTarget && !loading) {
          const w = e.currentTarget.getBoundingClientRect?.().width ?? 0;
          if (w > 0) setMeasuredWidth(Math.round(w));
        }
        if (shouldRipple && e.button === 0) {
          spawnTactileRipple(e.currentTarget, { clientX: e.clientX, clientY: e.clientY });
        }
        if (holdToConfirmMs && holdToConfirmMs > 0 && !isDisabled) {
          e.currentTarget.style?.setProperty('--tt-hold-progress', '1');
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          holdTimerRef.current = setTimeout(() => onHoldConfirm?.(), holdToConfirmMs);
        }
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          e.currentTarget.style?.setProperty('--tt-hold-progress', '0');
        }
        onPointerUp?.(e);
      }}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect?.();
        if (rect && rect.width > 0) {
          e.currentTarget.setAttribute(
            'data-entry-quadrant',
            detectHoverEntryQuadrant(e.clientX, e.clientY, rect).quadrant
          );
          if (isMagnetic) {
            const pull = computeMagneticPull(e.clientX, e.clientY, rect);
            e.currentTarget.style?.setProperty('--tt-magnetic-x', `${pull.x}px`);
            e.currentTarget.style?.setProperty('--tt-magnetic-y', `${pull.y}px`);
          }
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        e.currentTarget.style?.setProperty('--tt-hold-progress', '0');
        e.currentTarget.style?.setProperty('--tt-magnetic-x', '0px');
        e.currentTarget.style?.setProperty('--tt-magnetic-y', '0px');
        onPointerLeave?.(e);
      }}
      onKeyDown={(e) => {
        if (shouldRipple && !e.repeat && (e.key === 'Enter' || e.key === ' ')) {
          spawnTactileRipple(e.currentTarget, { clientX: 0, clientY: 0 });
        }
        onKeyDown?.(e);
      }}
      onClick={(e) => {
        if (copyText && !isDisabled) {
          try {
            void navigator?.clipboard?.writeText?.(copyText);
          } catch {
            /* ignore clipboard errors in headless environments */
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
        onClick?.(e);
      }}
      className={cn(
        'tt-spring-press inline-flex items-center justify-center gap-1.5 rounded-md transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant] ?? VARIANT.primary,
        SIZE[size] ?? SIZE.md,
        className
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <OrbitalLoadingSpinner size={14} className="text-current" />
          ) : copied ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              data-testid="copy-checkmark-icon"
              className="shrink-0 text-current"
            >
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            leftIcon
          )}
          {loading && loadingText ? loadingText : children}
          {!loading && rightIcon}
          {!loading && shortcut && (
            <kbd
              data-kbd-key={shortcut}
              className="ml-1 rounded border border-current/25 bg-black/10 px-1 py-0.5 font-mono text-[10px] leading-none opacity-80 transition-transform duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            >
              {shortcut}
            </kbd>
          )}
        </>
      )}
    </Comp>
  );
});
