'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import { useProfile } from '../profile/profile-store';
import { StagePicker } from './stage-picker';
import { TimelineEntryCard } from './timeline-entry';
import { useTimeline } from './use-timeline';

/**
 * The home page's "what should I do next?" card. Before the visitor says where they are it asks
 * one friendly question; after, it shows the top three things to do now, from the same engine as
 * the full timeline. Everything is computed from this browser's profile: no account needed.
 */
export function NextUp() {
  const { profile, hydrated } = useProfile();
  const state = useTimeline(profile, hydrated);

  return (
    <Card className="overflow-hidden">
      <CardBody className="grid gap-5">
        <div className="grid gap-1">
          <p className="eyebrow">Your next steps</p>
          <h2 className="text-2xl">What should you be doing, and when?</h2>
          <p className="text-ink-2">
            Applications, deadlines and the best time to start. Tell us where you are and we will
            show you what matters now.
          </p>
        </div>

        <StagePicker />

        {!hydrated || state.status === 'loading' ? (
          <div className="grid gap-3" aria-hidden>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : null}

        {state.status === 'error' ? (
          <p role="alert" className="text-danger">
            We could not load your timeline just now. Please try again in a moment.
          </p>
        ) : null}

        {state.status === 'ready' ? (
          <>
            {state.timeline.nextUp.length === 0 ? (
              <p className="text-ink-2">Nothing is urgent for you right now. Have a look around.</p>
            ) : (
              <ol className="grid gap-3" aria-label="Your top next steps">
                {state.timeline.nextUp.map((entry) => (
                  <li key={entry.rule.id}>
                    <TimelineEntryCard entry={entry} compact />
                  </li>
                ))}
              </ol>
            )}
            <Link
              href="/timeline"
              className={cn(buttonVariants({ variant: 'secondary' }), 'justify-self-start')}
            >
              See your full timeline
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
