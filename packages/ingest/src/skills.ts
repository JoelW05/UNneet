import { SKILLS } from '@unneet/content';
import { buildSkillMatcher, type SkillMatcher } from '@unneet/domain';

let matcher: SkillMatcher | undefined;

/** One matcher per process: building the phrase map is the only expensive part. */
export function getSkillMatcher(): SkillMatcher {
  matcher ??= buildSkillMatcher(SKILLS);
  return matcher;
}

export const SKILL_LABELS: ReadonlyMap<string, string> = new Map(
  SKILLS.map((s) => [s.id, s.label]),
);
