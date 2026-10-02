import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Small labels. Colour is never the only signal: every badge carries text. */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold leading-6 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-2 ring-1 ring-line',
        employment: 'bg-employment-tint text-employment',
        education: 'bg-education-tint text-education',
        training: 'bg-training-tint text-training',
        support: 'bg-support-tint text-support',
        success: 'bg-success-tint text-success',
        warning: 'bg-warning-tint text-warning',
        danger: 'bg-danger-tint text-danger',
        primary: 'bg-primary-tint text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
