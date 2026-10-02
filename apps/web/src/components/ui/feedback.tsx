import { AlertTriangle, CheckCircle2, Info, XOctagon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  info: {
    box: 'border-primary/40 bg-primary-tint',
    text: 'text-primary',
    Icon: Info,
    role: 'status',
  },
  success: {
    box: 'border-success/40 bg-success-tint',
    text: 'text-success',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    box: 'border-warning/40 bg-warning-tint',
    text: 'text-warning',
    Icon: AlertTriangle,
    role: 'status',
  },
  danger: {
    box: 'border-danger/40 bg-danger-tint',
    text: 'text-danger',
    Icon: XOctagon,
    role: 'alert',
  },
} as const;

/**
 * A message box. Always an icon + text (never colour alone); errors use role="alert" so they are
 * announced immediately, everything else role="status" (polite).
 */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ...props
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const { box, text, Icon, role } = tones[tone];
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-card border p-4', box, className)}
      {...props}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', text)} />
      <div className="grid gap-1">
        {title ? <p className={cn('font-bold', text)}>{title}</p> : null}
        {children ? <div className="text-ink">{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-control bg-surface-2', className)} />
  );
}

/** Native <progress>: announced correctly by every screen reader, no ARIA needed. */
export function Progress({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  return (
    <progress
      value={value}
      max={max}
      aria-label={label}
      className={cn(
        'h-2.5 w-full appearance-none overflow-hidden rounded-full bg-surface-2 [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-all',
        className,
      )}
    />
  );
}
