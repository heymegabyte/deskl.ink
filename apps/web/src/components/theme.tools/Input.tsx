import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './tt-physics';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * A `@theme.tools/ui` text input that inherits the active theme's surface + ring
 * tokens with smooth 333ms focus transitions and a damped horizontal validation
 * shake (MI09) when invalid.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', invalid, 'aria-invalid': ariaInvalid, ...props },
  ref
) {
  const isInvalid = Boolean(invalid || ariaInvalid === true || ariaInvalid === 'true');
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={isInvalid ? 'true' : ariaInvalid}
      data-ripple="false"
      data-shake={isInvalid ? 'true' : undefined}
      data-interaction-state={
        props.disabled ? 'disabled' : props.readOnly ? 'readonly' : isInvalid ? 'invalid' : 'rest'
      }
      className={cn(
        'min-w-0 rounded-md border border-border/90 bg-background/90 px-3 py-2 text-sm text-foreground shadow-2xs shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.06)] transition-all duration-[333ms] ease-[cubic-bezier(0.22,1,0.36,1)] outline-none ring-ring placeholder:text-muted-foreground/80 hover:border-primary/55 focus:border-primary focus:bg-background focus:ring-2 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50',
        isInvalid && 'tt-validation-shake border-destructive ring-2 ring-destructive/30',
        className
      )}
      {...props}
    />
  );
});
