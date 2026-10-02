import { levelLabel, TAG_LABEL } from '@unneet/domain';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Clock,
  FlaskConical,
  GraduationCap,
  MapPin,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormattedText } from '@/components/opportunities/formatted-text';
import { OpportunityCard } from '@/components/opportunities/opportunity-card';
import { ReportDialog } from '@/components/opportunities/report-dialog';
import { RequirementsBody } from '@/components/opportunities/requirements';
import { SaveButton } from '@/components/opportunities/save-button';
import { ShareButton } from '@/components/opportunities/share-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
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
import { absoluteUrl } from '@/lib/site';
import { getCurrentUser, getOpportunity, getSimilar } from '@/server/data';
import { jobPostingJsonLd } from './json-ld';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const o = await getOpportunity(slug).catch(() => null);
  if (!o) return { title: 'Listing not found', robots: { index: false } };
  const noindex = o.status === 'expired' || o.source.isSample;
  return {
    title: `${o.title} at ${o.organisation.name}`,
    description: o.summary,
    alternates: { canonical: `/opportunities/${o.slug}` },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: `${o.title} at ${o.organisation.name}`,
      description: o.summary,
      url: absoluteUrl(`/opportunities/${o.slug}`),
    },
  };
}

function Fact({
  icon: Icon,
  term,
  children,
}: {
  icon: typeof MapPin;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden className="mt-1 size-5 shrink-0 text-ink-2" />
      <div>
        <dt className="text-sm font-semibold text-ink-2">{term}</dt>
        <dd className="text-lg font-semibold text-ink">{children}</dd>
      </div>
    </div>
  );
}

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const [o, user] = await Promise.all([getOpportunity(slug), getCurrentUser()]);
  if (!o) notFound();
  const similar = await getSimilar(slug, 4).catch(() => []);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const signedIn = user !== null;
  const now = new Date();

  const expired = o.status === 'expired';
  const closed = o.closesAt ? new Date(o.closesAt) < now : false;
  const pay = payText(o);
  const cost = costText(o);
  const closes = closesText(o.closesAt, now);
  const tags = o.tags.map((t) => TAG_LABEL[t]);
  const sector = sectorName(o.sector);
  const structured = !expired && !closed && !o.source.isSample ? jobPostingJsonLd(o) : null;

  return (
    <div className="page py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-2">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <Link href="/search" className="underline">
              All opportunities
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/search?type=${o.type}`} className="underline">
              {typeLabel(o.type)}s
            </Link>
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <article className="min-w-0">
          <header className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={pillarTone(o.pillar)}>{typeLabel(o.type)}</Badge>
              {sector ? <Badge>{sector}</Badge> : null}
              {o.source.isSample ? <Badge tone="warning">Sample listing</Badge> : null}
              <FitChip listing={o} />
            </div>
            <h1 className="text-title">{o.title}</h1>
            <p className="text-xl text-ink-2">
              {o.organisation.url ? (
                <a
                  href={o.organisation.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {o.organisation.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                o.organisation.name
              )}
            </p>
          </header>

          {o.source.isSample ? (
            <Alert tone="warning" title="This is a sample listing" className="mt-6">
              <p>
                It is demo data used to test UnNEET and is not a real vacancy. Do not apply to it.
              </p>
            </Alert>
          ) : null}
          {expired || closed ? (
            <Alert
              tone="warning"
              title={expired ? 'This listing may have closed' : 'The closing date has passed'}
              className="mt-6"
            >
              <p>
                {expired
                  ? 'The provider has stopped publishing it. You can still check the original page, or look at similar opportunities below.'
                  : 'Check the original page: employers sometimes extend deadlines.'}
              </p>
            </Alert>
          ) : null}

          <dl className="mt-8 grid gap-x-8 gap-y-5 rounded-card border border-line bg-surface p-5 shadow-card sm:grid-cols-2 sm:p-6">
            <Fact icon={MapPin} term="Where">
              {locationText(o)}
            </Fact>
            {pay ? (
              <Fact icon={Banknote} term="Pay">
                {pay}
              </Fact>
            ) : null}
            {cost ? (
              <Fact icon={Wallet} term="Cost to you">
                {cost}
              </Fact>
            ) : null}
            {o.level !== null ? (
              <Fact icon={GraduationCap} term="Level">
                {levelLabel(o.level)}
              </Fact>
            ) : null}
            {o.duration ? (
              <Fact icon={Clock} term="How long">
                {o.duration}
              </Fact>
            ) : null}
            {o.startsAt ? (
              <Fact icon={CalendarDays} term="Starts">
                {date(o.startsAt)}
              </Fact>
            ) : null}
            {o.closesAt ? (
              <Fact icon={CalendarDays} term="Closing date">
                {date(o.closesAt)}
                {closes && !closed ? (
                  <span className="ml-2 text-base font-normal text-ink-2">({closes})</span>
                ) : null}
              </Fact>
            ) : null}
            {o.minAge !== null || o.maxAge !== null ? (
              <Fact icon={UserRound} term="Age">
                {o.minAge !== null && o.maxAge !== null
                  ? `${o.minAge} to ${o.maxAge}`
                  : o.minAge !== null
                    ? `${o.minAge} or over`
                    : `Up to ${o.maxAge}`}
              </Fact>
            ) : null}
          </dl>

          {o.minEntryLevel !== null && o.minEntryLevel > 0 ? (
            <p className="mt-4 flex items-start gap-2 text-ink-2">
              <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0" />
              <span>
                Usually needs {levelLabel(o.minEntryLevel)} or above to start. Check the original
                listing: some employers will take other experience instead.
              </span>
            </p>
          ) : null}

          {tags.length > 0 ? (
            <ul aria-label="Good to know" className="mt-5 flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t}>
                  <Badge tone="success">{t}</Badge>
                </li>
              ))}
            </ul>
          ) : null}

          {o.requirements ? (
            <section aria-labelledby="requirements-heading" className="mt-10">
              <h2 id="requirements-heading" className="mb-4 text-2xl">
                Minimum requirements
              </h2>
              <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
                <RequirementsBody listing={o} />
              </div>
            </section>
          ) : null}

          <section aria-labelledby="about-heading" className="mt-10">
            <h2 id="about-heading" className="mb-4 text-2xl">
              About this {typeLabel(o.type).toLowerCase()}
            </h2>
            <FormattedText text={o.description} />
          </section>

          {o.skills.length > 0 ? (
            <section aria-labelledby="skills-heading" className="mt-10">
              <h2 id="skills-heading" className="mb-3 text-2xl">
                Skills this uses
              </h2>
              <ul className="flex flex-wrap gap-2">
                {o.skills.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/search?q=${encodeURIComponent(s.label)}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-ink no-underline hover:bg-surface-2"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="source-heading"
            className="mt-10 rounded-card bg-surface-2 p-5 text-sm text-ink-2"
          >
            <h2 id="source-heading" className="mb-1 text-base font-bold text-ink">
              Where this comes from
            </h2>
            <p>
              {o.source.attributionUrl ? (
                <a
                  href={o.source.attributionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {o.source.attribution}
                </a>
              ) : (
                o.source.attribution
              )}{' '}
              {o.postedAt ? postedText(o.postedAt, now) : null}. Last checked {date(o.updatedAt)}.
              We do not take applications: you apply on the provider’s own page.
            </p>
            <p className="mt-2 flex items-center gap-1">
              <FlaskConical aria-hidden className="size-4" />
              Licence: {o.source.licence}
            </p>
          </section>
        </article>

        <aside aria-label="Apply" className="lg:sticky lg:top-6 lg:self-start">
          <div className="grid gap-4 rounded-card border border-line bg-surface p-5 shadow-lift">
            <a
              href={o.applyUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
            >
              {o.type === 'support' || o.type === 'programme'
                ? 'Get this support'
                : o.type === 'course' || o.type === 'degree' || o.type === 't-level'
                  ? 'Find out more and apply'
                  : 'Apply on the provider’s site'}
              <ArrowUpRight aria-hidden className="size-5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="text-sm text-ink-2">
              Opens{' '}
              {o.source.providerName === 'UnNEET editorial'
                ? 'the official page'
                : 'the original listing'}
              . You will not be charged by UnNEET, and nobody should ask you to pay to be considered
              for a job.
            </p>
            <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
              <SaveButton
                variant="full"
                signedIn={signedIn}
                item={{ id: o.id, slug: o.slug, title: o.title, organisation: o.organisation.name }}
              />
              <ShareButton title={o.title} />
              <ReportDialog slug={o.slug} title={o.title} />
            </div>
          </div>
        </aside>
      </div>

      {similar.length > 0 ? (
        <section aria-labelledby="similar-heading" className="mt-16">
          <h2 id="similar-heading" className="mb-5 text-2xl">
            Similar opportunities
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {similar.map((card) => (
              <li key={card.id}>
                <OpportunityCard card={card} signedIn={signedIn} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {structured ? (
        <script
          type="application/ld+json"
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD built from our own data and escaped below.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
        />
      ) : null}
    </div>
  );
}
