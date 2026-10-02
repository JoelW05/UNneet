'use client';

import { academicYearOf, STAGE_INFO, STAGES, type Stage } from '@unneet/domain';
import { Field, Select } from '@/components/ui/field';
import { useProfile } from '../profile/profile-store';

const GROUPS: Array<{ label: string; stages: Stage[] }> = [
  { label: 'At school', stages: ['year-11', 'year-12', 'year-13'] },
  { label: 'College or training', stages: ['college', 'apprentice'] },
  { label: 'At university', stages: ['uni-year-1', 'uni-year-2', 'uni-final-year', 'graduate'] },
  { label: 'Not in a course', stages: ['working', 'between-things'] },
];

// Guard: every stage must be offered exactly once, or a person could have no way to say where they are.
const offered = GROUPS.flatMap((g) => g.stages);
if (offered.length !== STAGES.length || STAGES.some((s) => !offered.includes(s))) {
  throw new Error('StagePicker groups must cover every stage exactly once');
}

/**
 * "Where are you right now?" Setting it records the academic year too, so next September we can
 * ask "has your year changed?" instead of assuming.
 */
export function StagePicker({ label = 'Where are you right now?' }: { label?: string }) {
  const { profile, update } = useProfile();
  return (
    <Field
      label={label}
      hint={
        profile.stage
          ? STAGE_INFO[profile.stage].hint
          : 'Pick the closest one. You can change it any time.'
      }
    >
      {(a11y) => (
        <Select
          {...a11y}
          value={profile.stage ?? ''}
          onChange={(e) => {
            const stage = (e.target.value || undefined) as Stage | undefined;
            update(
              stage
                ? { stage, stageSetAcademicYear: academicYearOf(new Date()) }
                : { stage: undefined, stageSetAcademicYear: undefined },
            );
          }}
        >
          <option value="">Choose…</option>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.stages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_INFO[s].label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}
    </Field>
  );
}
