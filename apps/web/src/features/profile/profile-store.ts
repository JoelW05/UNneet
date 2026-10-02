'use client';

import {
  academicYearOf,
  advanceStage,
  EMPTY_PROFILE,
  type Profile,
  ProfileSchema,
  type Stage,
} from '@unneet/domain';
import { useCallback } from 'react';
import { createLocalStore, useHydrated, useLocalStore } from '@/lib/local-store';

/**
 * The visitor's profile, kept in this browser. Everything on UnNEET works without an account:
 * quizzes, matches and the timeline run from this. Signing in just backs it up (see ClientSync).
 */
export const profileStore = createLocalStore<Profile>({
  key: 'unneet.profile.v1',
  empty: EMPTY_PROFILE,
  parse: (raw) => {
    try {
      const parsed = ProfileSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
});

export type ProfileUpdate = Partial<Profile> | ((current: Profile) => Profile);

export function applyProfileUpdate(current: Profile, update: ProfileUpdate): Profile {
  const next = typeof update === 'function' ? update(current) : { ...current, ...update };
  // Validate on every write: nothing malformed ever reaches storage or the API.
  return ProfileSchema.parse(next);
}

export function useProfile() {
  const profile = useLocalStore(profileStore);
  const hydrated = useHydrated();

  const update = useCallback((patch: ProfileUpdate) => {
    profileStore.write(applyProfileUpdate(profileStore.read(), patch));
  }, []);
  const reset = useCallback(() => profileStore.clear(), []);

  return { profile, hydrated, update, reset };
}

/** Has the visitor told us anything yet? Used to decide between "get started" and "your plan". */
export function hasAnyProfileData(p: Profile): boolean {
  return (
    p.ageBand !== undefined ||
    p.goal !== undefined ||
    p.location !== undefined ||
    p.skills.length > 0 ||
    p.riasec !== undefined ||
    p.values.length > 0 ||
    p.sectorsInterested.length > 0 ||
    p.stage !== undefined ||
    p.highestLevel > 0 ||
    p.jobTitles.length > 0 ||
    p.education.length > 0 ||
    p.experience.length > 0 ||
    p.achievements.length > 0
  );
}

export interface StageStatus {
  stage: Stage | null;
  /** True when a new academic year has started since they chose it: ask rather than assume. */
  needsConfirmation: boolean;
}

/**
 * Their stage "now": a September rollover moves a school/uni year on by one where that is
 * unambiguous, and flags that we should ask, because assumptions about people's lives age badly.
 */
export function stageStatus(profile: Profile, now: Date = new Date()): StageStatus {
  if (!profile.stage) return { stage: null, needsConfirmation: false };
  const setIn = profile.stageSetAcademicYear ?? academicYearOf(now);
  return advanceStage(profile.stage, setIn, now);
}
