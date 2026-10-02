'use client';

import {
  type FitListing,
  levelLabel,
  REQUIREMENT_KIND_LABEL,
  type RequirementItem,
  type RequirementKind,
  type Requirements,
} from '@unneet/domain';
import { ChevronDown } from 'lucide-react';
import { FitPanel } from '@/features/fit/fit-ui';
import { cn } from '@/lib/cn';

/**
 * "Minimum requirements": what the advert itself asks of an applicant, read from its text, plus
 * how the visitor fits. Always framed as a reading of the advert (we can miss things), never as
 * a rule, and never hides that some adverts simply do not say.
 */

export type RequirementsListing = FitListing & {
  title: string;
  requirements?: Requirements | null | undefined;
};

const ORDER: readonly RequirementKind[] = ['qualification', 'experience', 'check', 'age', 'skill'];

function experienceSentence(r: Requirements): string {
  const { required, years, basis, evidence } = r.experience;
  if (required === false) {
    if (basis === 'text') return 'No experience needed. The advert says so.';
    if (basis === 'title') return 'No experience needed. This is an entry route.';
    return 'No experience needed. This kind of opportunity is open to beginners.';
  }
  if (required === true) {
    if (years !== null) {
      return `About ${years} year${years === 1 ? '' : 's'} of experience.`;
    }
    if (basis === 'title') {
      return 'Experience is likely needed. It is a senior role, and the advert does not say how much.';
    }
    return evidence ? `Experience is asked for: “${evidence}”` : 'Experience is asked for.';
  }
  return 'The advert does not say whether you need experience.';
}

function Items({ items, label }: { items: RequirementItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <>
      {label ? <p className="mt-1 text-sm font-semibold text-ink-2">{label}</p> : null}
      <ul className="grid list-disc gap-1 pl-5 marker:text-ink-2">
        {items.map((i) => (
          <li key={`${i.kind}:${i.text}`}>{i.text}</li>
        ))}
      </ul>
    </>
  );
}

/** The body of the panel. Used inside the card dropdown and open on the detail page. */
export function RequirementsBody({ listing }: { listing: RequirementsListing }) {
  const r = listing.requirements ?? null;
  if (!r) return null;

  const levelLine =
    r.minLevel === null
      ? null
      : `Around ${levelLabel(r.minLevel)} or above${r.equivalentAccepted ? ', or something equivalent' : ''}.`;

  return (
    <div className="grid gap-4 text-ink">
      <section className="grid gap-1.5" aria-label="Experience">
        <h4 className="font-bold">{REQUIREMENT_KIND_LABEL.experience}</h4>
        <p>{experienceSentence(r)}</p>
        <Items items={r.items.filter((i) => i.kind === 'experience' && i.essential)} />
      </section>

      {ORDER.filter((k) => k !== 'experience').map((kind) => {
        const items = r.items.filter((i) => i.kind === kind);
        const essential = items.filter((i) => i.essential);
        const helpful = items.filter((i) => !i.essential);
        const empty = items.length === 0 && !(kind === 'qualification' && levelLine);
        if (empty && kind !== 'qualification') return null;
        return (
          <section key={kind} className="grid gap-1.5" aria-label={REQUIREMENT_KIND_LABEL[kind]}>
            <h4 className="font-bold">{REQUIREMENT_KIND_LABEL[kind]}</h4>
            {kind === 'qualification' && levelLine ? <p>{levelLine}</p> : null}
            {kind === 'qualification' && !levelLine && essential.length === 0 ? (
              <p>{r.stated ? 'None asked for.' : 'The advert does not say.'}</p>
            ) : null}
            <Items items={essential} />
            <Items items={helpful} label="Helpful, but not essential" />
          </section>
        );
      })}

      <FitPanel listing={listing} className="rounded-md bg-surface-2 p-4" />

      <p className="text-sm text-ink-2">
        We read this from the advert’s own wording, so we can miss things or get one wrong. Always
        read the full advert before you apply, and ask the employer if you are unsure. Many people
        apply when they meet most, not all, of a list.
      </p>
    </div>
  );
}

/** A collapsible "Minimum requirements" for result cards. Native <details>: no JS needed to open. */
export function RequirementsDropdown({
  listing,
  className,
}: {
  listing: RequirementsListing;
  className?: string;
}) {
  if (!listing.requirements) return null;
  return (
    <details
      className={cn(
        'group relative z-10 rounded-md border border-line bg-surface-2/50 [&_summary::-webkit-details-marker]:hidden',
        className,
      )}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:outline-none">
        <span>
          Minimum requirements
          <span className="sr-only"> for {listing.title}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-ink-2 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-line p-4 text-sm">
        <RequirementsBody listing={listing} />
      </div>
    </details>
  );
}
