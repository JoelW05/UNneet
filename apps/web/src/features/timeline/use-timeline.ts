'use client';

import type { Profile, Stage, Timeline } from '@unneet/domain';
import { useEffect, useState } from 'react';
import { browserApi } from '@/lib/browser-api';
import { stageStatus } from '../profile/profile-store';

export type TimelineState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; timeline: Timeline; stage: Stage; needsConfirmation: boolean }
  | { status: 'error' };

/**
 * The visitor's personalised timeline, fetched from the (stateless) API using what is in their
 * profile. Refetches when their stage, interests or ticked-off items change. A stale response for
 * an earlier input is discarded, so quick changes can never show the wrong plan.
 */
export function useTimeline(profile: Profile, hydrated: boolean, asOf?: string): TimelineState {
  const [state, setState] = useState<TimelineState>({ status: 'idle' });

  const { stage, needsConfirmation } = stageStatus(profile);
  const sectors = profile.sectorsInterested.join(',');
  const done = profile.doneTimelineIds.join(',');
  const startedOn = profile.journeyStartedOn;

  useEffect(() => {
    if (!hydrated || !stage) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    browserApi
      .GET('/v1/timeline', {
        params: {
          query: {
            stage,
            ...(sectors ? { sectors } : {}),
            ...(done ? { done } : {}),
            ...(startedOn ? { startedOn } : {}),
            ...(asOf ? { asOf } : {}),
          },
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) setState({ status: 'error' });
        else
          setState({
            status: 'ready',
            timeline: data as unknown as Timeline,
            stage,
            needsConfirmation,
          });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, stage, needsConfirmation, sectors, done, startedOn, asOf]);

  return state;
}
