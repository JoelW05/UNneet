import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

/**
 * Buttons are at least 44px tall (WCAG 2.2 target size, comfortably above the 24px minimum) and
 * show a 3px focus ring from the global :focus-visible rule.
 */
export const buttonVariants = cva(
  'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-control px-5 text-base font-semibold no-underline transition-colors disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-ink hover:bg-primary-hover',
        secondary: 'border-2 border-field bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink hover:bg-surface-2',
        subtle: 'bg-primary-tint text-primary hover:brightness-95',
        danger: 'bg-danger-tint text-danger ring-1 ring-danger/40 hover:brightness-95',
      },
      size: {
        sm: 'min-h-10 px-3.5 text-sm',
        md: '',
        lg: 'min-h-13 px-7 text-lg',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  type = 'button',
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
