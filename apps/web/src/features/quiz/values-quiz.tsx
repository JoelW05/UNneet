'use client';

import { type ValueKey, WORK_VALUES } from '@unneet/domain';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Choice } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useProfile } from '../profile/profile-store';

const MAX = 3;

/** "What matters most to you in work?" Pick up to three. Saved as you go. */
export function ValuesQuiz() {
  const { profile, hydrated, update } = useProfile();
  const chosen = new Set<ValueKey>(profile.values);
  const full = chosen.size >= MAX;

  const toggle = (key: ValueKey, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(key);
    else next.delete(key);
    update({ values: [...next].slice(0, MAX) });
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <fieldset className="grid gap-1" disabled={!hydrated}>
        <legend className="mb-2 text-lg text-ink-2">
          Choose up to <strong className="text-ink">three</strong> things you want from work.
        </legend>
        {WORK_VALUES.map((v) => {
          const checked = chosen.has(v.key);
          return (
            <Choice
              key={v.key}
              type="checkbox"
              checked={checked}
              disabled={!checked && full}
              onChange={(e) => toggle(v.key, e.target.checked)}
              label={v.label}
              description={v.description}
              className={cn(
                'rounded-card border-2 border-line bg-surface px-4',
                checked && 'border-primary bg-primary-tint',
              )}
            />
          );
        })}
      </fieldset>

      <p role="status" aria-live="polite" className="text-ink-2">
        {chosen.size === 0
          ? 'Nothing chosen yet.'
          : `${chosen.size} of ${MAX} chosen.${full ? ' Untick one to swap it.' : ''}`}
      </p>

      <div className="flex flex-wrap gap-3">
        <Link href="/results" className={cn(buttonVariants({ size: 'lg' }))}>
          See what fits
          <ArrowRight aria-hidden className="size-5" />
        </Link>
        <Link href="/quiz" className={cn(buttonVariants({ size: 'lg', variant: 'secondary' }))}>
          Back to quizzes
        </Link>
      </div>
    </div>
  );
}
