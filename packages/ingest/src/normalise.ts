import {
  classifySector,
  extractRequirements,
  htmlToText,
  type OpportunityInput,
  type OpportunityTag,
  type Requirements,
  saysNoQualifications,
  tidyTitle,
} from '@unneet/domain';
import { getSkillMatcher } from './skills';

export interface Normalised {
  input: OpportunityInput;
  skillIds: string[];
  /** What the advert asks of an applicant, read from its text (see domain `extractRequirements`). */
  requirements: Requirements;
}

const MAX_SKILLS = 12;

/**
 * Cheap, conservative text signals. They only ADD helpful tags. ("No experience needed" is not
 * here: it comes from the requirements reading, which knows a senior title when it sees one.)
 */
const TAG_SIGNALS: ReadonlyArray<readonly [OpportunityTag, RegExp]> = [
  ['disability-confident', /\bdisability confident\b/i],
  ['guaranteed-interview', /\bguaranteed (an )?interview\b/i],
];

/**
 * The canonical clean-up every provider's records go through, after mapping and validation:
 * strip markup, tidy the title, classify the sector when the provider didn't, detect skills and
 * helpful tags. Pure and deterministic, so it is unit-tested once for every source.
 */
export function normalise(input: OpportunityInput): Normalised {
  const rawDescription = input.description.trim();
  const description = /<[a-z!/][^>]*>/i.test(rawDescription)
    ? htmlToText(rawDescription)
    : rawDescription;
  const title = tidyTitle(input.title);
  const text = `${title}\n${description}`;

  // An explicit `null` means "we know there is no single sector" and is respected; only a missing
  // value is classified from the text.
  const sector =
    input.sector !== undefined ? input.sector : classifySector(title, description).sector;

  const requirements = extractRequirements({ title, description, type: input.type });
  const { experience } = requirements;

  const tags = new Set<OpportunityTag>(input.tags ?? []);
  for (const [tag, re] of TAG_SIGNALS) if (re.test(text)) tags.add(tag);
  // Only an explicit "no experience needed" in the advert earns the badge, and a role that needs
  // experience (a senior title, an essential experience line) can never carry it.
  if (experience.required === false && experience.basis === 'text') tags.add('no-experience');
  if (experience.required === true) tags.delete('no-experience');
  // Likewise "no qualifications needed": only when that is all the advert asks for.
  if (
    requirements.minLevel === 0 &&
    requirements.items.some(
      (i) => i.kind === 'qualification' && i.essential && saysNoQualifications(i.text),
    )
  ) {
    tags.add('no-qualifications');
  }

  const skillIds = getSkillMatcher()
    .extract(text)
    .slice(0, MAX_SKILLS)
    .map((s) => s.id);

  return {
    input: {
      ...input,
      title,
      description: description || title,
      sector,
      tags: [...tags],
      // What the advert says beats a provider's guess; a provider's explicit value fills the gaps.
      experienceRequired: experience.required ?? input.experienceRequired ?? null,
      minEntryLevel: input.minEntryLevel ?? requirements.minLevel,
      minAge: input.minAge ?? requirements.minAge,
    },
    skillIds,
    requirements,
  };
}
