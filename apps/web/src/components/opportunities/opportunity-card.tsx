import type { OpportunityCard as Card } from '@unneet/domain';
import { levelLabel, TAG_LABEL } from '@unneet/domain';
import { Banknote, Clock, ExternalLink, GraduationCap, MapPin, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { FitChip } from '@/features/fit/fit-ui';
import { cn } from '@/lib/cn';
import {
  closesText,
  costText,
  locationText,
  payText,
  pillarTone,
  postedText,
  sectorName,
  typeLabel,
} from '@/lib/present';
import { RequirementsDropdown } from './requirements';
import { SaveButton } from './save-button';

const SHOWN_TAGS = [
  'no-experience',
  'no-qualifications',
  'guaranteed-interview',
  'disability-confident',
  'part-time',
  'online',
] as const;

function Meta({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />
      <span>{children}</span>
    </li>
  );
}

/**
 * One result. The whole card is clickable through the title link (a stretched ::after), while the
 * save button sits above it. For partner job-board results (no detail page on our site) the card
 * links straight to the provider, says so, and names the provider.
 */
export function OpportunityCard({
  card,
  signedIn,
  now = new Date(),
  className,
}: {
  card: Card;
  signedIn: boolean;
  now?: Date;
  className?: string;
}) {
  const external = Boolean(card.externalUrl);
  const href = external ? (card.externalUrl as string) : `/opportunities/${card.slug}`;
  const pay = payText(card);
  const cost = costText(card);
  const closes = closesText(card.closesAt, now);
  const closingSoon = closes !== null && /today|tomorrow|in \d+ days/.test(closes);
  const posted = postedText(card.postedAt, now);
  const sector = sectorName(card.sector);
  const tags = SHOWN_TAGS.filter((t) => card.tags.includes(t));

  return (
    <article
      className={cn(
        'group relative grid gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-lift focus-within:shadow-lift',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={pillarTone(card.pillar)}>{typeLabel(card.type)}</Badge>
        {card.source.isSample ? <Badge tone="warning">Sample listing</Badge> : null}
        {closingSoon ? <Badge tone="danger">{closes}</Badge> : null}
        {sector ? <span className="text-sm text-ink-2">{sector}</span> : null}
        <FitChip listing={card} />
        <span className="ml-auto -mr-2 -mt-2">
          <SaveButton
            signedIn={signedIn}
            item={{
              id: card.id,
              slug: card.slug,
              title: card.title,
              organisation: card.organisation.name,
            }}
          />
        </span>
      </div>

      <div className="grid gap-1">
        <h3 className="text-xl leading-snug">
          {external ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
            >
              {card.title}
              <span className="sr-only"> (opens {card.source.providerName} in a new tab)</span>
              <ExternalLink
                aria-hidden
                className="ml-1.5 inline size-4 align-baseline text-ink-2"
              />
            </a>
          ) : (
            <Link
              href={href}
              className="text-ink no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
            >
              {card.title}
            </Link>
          )}
        </h3>
        <p className="text-ink-2">{card.organisation.name}</p>
      </div>

      <p className="line-clamp-2 text-ink">{card.summary}</p>

      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink">
        <Meta icon={MapPin}>{locationText(card)}</Meta>
        {pay ? <Meta icon={Banknote}>{pay}</Meta> : null}
        {cost ? <Meta icon={Wallet}>{cost}</Meta> : null}
        {card.level !== null ? <Meta icon={GraduationCap}>{levelLabel(card.level)}</Meta> : null}
        {card.duration ? <Meta icon={Clock}>{card.duration}</Meta> : null}
      </ul>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Good to know">
          {tags.map((t) => (
            <li key={t}>
              <Badge tone="success">{TAG_LABEL[t]}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <RequirementsDropdown listing={card} />

      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm text-ink-2">
        <span>
          {external ? `Jobs by ${card.source.providerName}` : `Source: ${card.source.providerName}`}
        </span>
        <span>{!closingSoon && closes ? closes : posted}</span>
      </p>
    </article>
  );
}
