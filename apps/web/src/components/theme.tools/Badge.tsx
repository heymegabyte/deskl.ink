import { type HTMLAttributes, useState } from 'react';
import {
  cn,
  computeCopyMorphState,
  computeCursorSpotlight,
  computeMagneticPull,
  detectHoverEntryQuadrant,
  spawnTactileRipple,
} from './tt-physics';

export type BadgeVariant =
  | 'outline'
  | 'muted'
  | 'secondary'
  | 'primary'
  | 'accent'
  | 'default'
  | 'success'
  | 'warning'
  | 'destructive';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  pulse?: boolean;
  interactive?: boolean;
  ripple?: boolean;
  magnetic?: boolean;
  spotlight?: boolean;
  copyText?: string;
  shortcut?: string;
}

const VARIANT: Record<BadgeVariant, string> = {
  outline:
    'border border-border/90 bg-background/60 text-foreground shadow-2xs hover:border-primary/40',
  muted: 'border border-border/50 bg-muted/85 text-foreground shadow-2xs',
  secondary: 'border border-border/75 bg-secondary/80 text-secondary-foreground shadow-2xs',
  primary:
    'border border-primary/50 bg-primary/18 text-foreground shadow-2xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]',
  accent:
    'border border-accent/45 bg-accent/15 text-foreground shadow-2xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]',
  default:
    'border border-primary/45 bg-primary/15 text-foreground shadow-2xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]',
  success: 'border border-primary/50 bg-primary/15 text-foreground shadow-2xs',
  warning: 'border border-accent/55 bg-accent/20 text-foreground shadow-2xs',
  destructive: 'border border-destructive/55 bg-destructive/15 text-destructive shadow-2xs',
};

/**
 * A `@theme.tools/ui` rounded tag/pill — appearance labels, token chips, live status
 * marks, and interactive filter pills. Enumerable values should ALWAYS render as these
 * pills, never comma-joined text.
 */
export function Badge({
  variant = 'outline',
  pulse = false,
  interactive = false,
  ripple,
  magnetic,
  spotlight,
  copyText,
  shortcut,
  className,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onKeyDown,
  onClick,
  children,
  ...props
}: BadgeProps) {
  const [copiedAtMs, setCopiedAtMs] = useState<number | null>(null);
  const copyMorph = computeCopyMorphState(copiedAtMs, copiedAtMs ?? 0);
  const isInteractive =
    interactive || Boolean(onClick) || Boolean(copyText) || ripple === true || magnetic === true;
  const shouldRipple = ripple !== undefined ? ripple : isInteractive;
  const shouldSpotlight = spotlight !== undefined ? spotlight : isInteractive;
  const isMagnetic = Boolean(magnetic);
  return (
    <span
      data-ripple={shouldRipple ? 'true' : undefined}
      data-spotlight={shouldSpotlight ? 'true' : undefined}
      data-magnetic={isMagnetic ? 'true' : undefined}
      data-copy-text={copyText}
      data-copy-state={copyText ? (copyMorph.copied ? 'copied' : 'idle') : undefined}
      onPointerDown={(e) => {
        if (shouldRipple && e.button === 0) {
          spawnTactileRipple(e.currentTarget, { clientX: e.clientX, clientY: e.clientY });
        }
        onPointerDown?.(e);
      }}
      onPointerEnter={(e) => {
        if (isInteractive || shouldSpotlight || isMagnetic) {
          const rect = e.currentTarget.getBoundingClientRect?.();
          if (rect && rect.width > 0) {
            e.currentTarget.setAttribute(
              'data-entry-quadrant',
              detectHoverEntryQuadrant(e.clientX, e.clientY, rect).quadrant
            );
          }
        }
        onPointerEnter?.(e);
      }}
      onPointerMove={(e) => {
        if (isInteractive || shouldSpotlight || isMagnetic) {
          const rect = e.currentTarget.getBoundingClientRect?.();
          if (rect && rect.width > 0) {
            if (shouldSpotlight) {
              const spot = computeCursorSpotlight(e.clientX, e.clientY, rect, 120);
              e.currentTarget.style?.setProperty('--tt-spot-x', `${spot.xPx}px`);
              e.currentTarget.style?.setProperty('--tt-spot-y', `${spot.yPx}px`);
            }
            e.currentTarget.setAttribute(
              'data-entry-quadrant',
              detectHoverEntryQuadrant(e.clientX, e.clientY, rect).quadrant
            );
            if (isMagnetic) {
              const pull = computeMagneticPull(e.clientX, e.clientY, rect, 3);
              e.currentTarget.style?.setProperty('--tt-magnetic-x', `${pull.x}px`);
              e.currentTarget.style?.setProperty('--tt-magnetic-y', `${pull.y}px`);
            }
          }
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        if (isMagnetic || isInteractive) {
          e.currentTarget.style?.setProperty('--tt-magnetic-x', '0px');
          e.currentTarget.style?.setProperty('--tt-magnetic-y', '0px');
        }
        onPointerLeave?.(e);
      }}
      onKeyDown={(e) => {
        if (shouldRipple && !e.repeat && (e.key === 'Enter' || e.key === ' ')) {
          spawnTactileRipple(e.currentTarget, { clientX: 0, clientY: 0 });
        }
        onKeyDown?.(e);
      }}
      onClick={
        copyText || onClick
          ? (e) => {
              if (copyText) {
                try {
                  void navigator?.clipboard?.writeText?.(copyText);
                } catch {
                  /* ignore clipboard errors in headless environments */
                }
                setCopiedAtMs(Date.now());
                setTimeout(() => setCopiedAtMs(null), 1600);
              }
              onClick?.(e);
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] tracking-wide transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        isInteractive &&
          'tt-spring-press relative overflow-hidden cursor-pointer active:scale-[0.97]',
        VARIANT[variant] ?? VARIANT.outline,
        className
      )}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden="true"
          className="tt-pulse-glow inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {copyText && copyMorph.copied ? copyMorph.statusLabel : children}
      {shortcut && (
        <kbd
          data-kbd-key={shortcut}
          className="ml-0.5 rounded border border-current/25 bg-black/10 px-1 py-0.5 font-mono text-[9px] leading-none opacity-80"
        >
          {shortcut}
        </kbd>
      )}
    </span>
  );
}
