import { actionHref, type TimelineEntry as Entry } from '@unneet/domain';
import { CalendarClock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const STATUS = {
  now: { label: 'Do this now', tone: 'danger' as const },
  soon: { label: 'Coming up', tone: 'warning' as const },
  later: { label: 'Later', tone: 'neutral' as const },
  missed: { label: 'Recently passed', tone: 'neutral' as const },
  done: { label: 'Done', tone: 'success' as const },
};

/**
 * One item on the timeline. The status is text first (never colour alone). Dates are shown as the
 * engine computed them: exact only for sourced national deadlines, otherwise "typically".
 */
export function TimelineEntryCard({
  entry,
  compact = false,
  className,
}: {
  entry: Entry;
  compact?: boolean;
  className?: string;
}) {
  const { rule } = entry;
  const status = STATUS[entry.status];
  const action = rule.action ? actionHref(rule.action) : null;

  return (
    <article
      className={cn('grid gap-2 rounded-card border border-line bg-surface p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {entry.fromNextStage ? <Badge tone="primary">For next year</Badge> : null}
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <CalendarClock aria-hidden className="size-4" />
          {entry.windowLabel}
          {entry.exact ? <span className="sr-only"> (official date)</span> : null}
        </span>
      </div>
      <h3 className={cn('font-bold', compact ? 'text-lg' : 'text-xl')}>{rule.title}</h3>
      <p className="text-ink">{rule.summary}</p>
      {!compact ? (
        <>
          <p className="text-ink-2">
            <strong className="text-ink">Why now: </strong>
            {rule.why}
          </p>
          {rule.prepare.length > 0 ? (
            <div>
              <p className="font-semibold">Get ready</p>
              <ul className="mt-1 grid list-disc gap-0.5 pl-5 text-ink-2">
                {rule.prepare.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {rule.caveat ? <p className="text-sm text-ink-2">{rule.caveat}</p> : null}
          {entry.status === 'missed' && rule.missedNote ? (
            <p className="text-sm text-ink-2">{rule.missedNote}</p>
          ) : null}
        </>
      ) : null}
      {action ? (
        <div className="mt-1">
          {action.external ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'subtle', size: 'sm' }))}
            >
              {rule.action?.label}
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link
              href={action.href}
              className={cn(buttonVariants({ variant: 'subtle', size: 'sm' }))}
            >
              {rule.action?.label}
            </Link>
          )}
        </div>
      ) : null}
    </article>
  );
}
