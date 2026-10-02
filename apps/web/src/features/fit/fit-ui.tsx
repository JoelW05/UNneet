'use client';

import {
  assessFit,
  type CheckStatus,
  FIT_LABEL,
  type Fit,
  type FitCheck,
  type FitLight,
  type FitListing,
} from '@unneet/domain';
import { CircleAlert, CircleCheck, CircleHelp, CircleMinus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useProfile } from '@/features/profile/profile-store';
import { cn } from '@/lib/cn';

/**
 * How well a person fits what an advert asks for, as a traffic light. Colour is never the only
 * signal: every state has its own icon shape and its own words, and the explanation is always
 * one tap away. It describes fit with the written requirements, not the chance of being hired.
 */

const TONE: Readonly<Record<FitLight, 'success' | 'warning' | 'danger' | 'neutral'>> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  unknown: 'neutral',
};

const LIGHT_ICON = {
  green: CircleCheck,
  amber: CircleAlert,
  red: CircleMinus,
  unknown: CircleHelp,
} as const;

const STATUS_ICON: Readonly<Record<CheckStatus, typeof CircleCheck>> = {
  meets: CircleCheck,
  close: CircleAlert,
  gap: CircleMinus,
  unknown: CircleHelp,
};

const STATUS_WORDS: Readonly<Record<CheckStatus, string>> = {
  meets: 'You meet this',
  close: 'Close',
  gap: 'Not yet',
  unknown: 'Not stated',
};

const STATUS_COLOUR: Readonly<Record<CheckStatus, string>> = {
  meets: 'text-success',
  close: 'text-warning',
  gap: 'text-danger',
  unknown: 'text-ink-2',
};

/** Assess one listing for the visitor's saved profile. `fit` is null until the profile has loaded. */
export function useFit(listing: FitListing): { fit: Fit | null; hydrated: boolean } {
  const { profile, hydrated } = useProfile();
  const fit = useMemo(
    () => (hydrated ? assessFit(profile, listing) : null),
    [hydrated, profile, listing],
  );
  return { fit, hydrated };
}

/** The traffic-light chip. Renders nothing until we know something useful to say. */
export function FitChip({ listing, className }: { listing: FitListing; className?: string }) {
  const { fit } = useFit(listing);
  if (!fit || fit.light === 'unknown') return null;
  const Icon = LIGHT_ICON[fit.light];
  return (
    <Badge tone={TONE[fit.light]} className={cn('relative z-10', className)}>
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">How you fit: </span>
      {FIT_LABEL[fit.light]}
    </Badge>
  );
}

function CheckRow({ check }: { check: FitCheck }) {
  const Icon = STATUS_ICON[check.status];
  return (
    <li className="flex gap-2.5">
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', STATUS_COLOUR[check.status])} />
      <p>
        <span className="font-semibold text-ink">{check.label}: </span>
        <span className={cn('font-semibold', STATUS_COLOUR[check.status])}>
          {STATUS_WORDS[check.status]}.
        </span>{' '}
        <span className="text-ink">{check.detail}</span>
      </p>
    </li>
  );
}

/** The reasons behind the light, or a gentle prompt to tell us about yourself. */
export function FitPanel({ listing, className }: { listing: FitListing; className?: string }) {
  const { fit, hydrated } = useFit(listing);
  if (!hydrated || !fit) return null;

  if (fit.reason === 'no-profile') {
    return (
      <div className={cn('grid gap-2', className)}>
        <h4 className="font-bold text-ink">How you fit</h4>
        <p className="text-ink">
          Tell us what you have done and we will show how well you fit what this one asks for.{' '}
          <Link href="/cv" className="font-semibold underline">
            Check your CV
          </Link>{' '}
          or{' '}
          <Link href="/profile" className="font-semibold underline">
            add it by hand
          </Link>
          . It takes a couple of minutes, and it stays on your device.
        </p>
      </div>
    );
  }
  if (fit.reason === 'no-requirements') return null;

  const Icon = LIGHT_ICON[fit.light];
  return (
    <div className={cn('grid gap-3', className)}>
      <h4 className="flex flex-wrap items-center gap-2 font-bold text-ink">
        How you fit
        <Badge tone={TONE[fit.light]}>
          <Icon aria-hidden className="size-4" />
          {FIT_LABEL[fit.light]}
          {fit.score !== null ? <span className="font-normal"> · {fit.score}/100</span> : null}
        </Badge>
      </h4>
      <p className="text-ink">{fit.headline}</p>
      <ul className="grid gap-2">
        {fit.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
      <p className="text-ink-2">
        This compares your profile with what the advert asks for. It cannot tell you whether you
        will be offered the job: employers choose between people, and many hire people who meet most
        of a list.
      </p>
    </div>
  );
}
