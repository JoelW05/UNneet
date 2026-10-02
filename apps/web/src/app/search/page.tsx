import type { SearchQuery } from '@unneet/domain';
import { ExternalLink, SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { OpportunityCard } from '@/components/opportunities/opportunity-card';
import { Pagination } from '@/components/search/pagination';
import { PendingRegion } from '@/components/search/pending';
import { SearchForm } from '@/components/search/search-form';
import { SortSelect } from '@/components/search/sort-select';
import { buttonVariants } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import { countText } from '@/lib/present';
import { activeFilters, parseSearch, type RawParams, searchHref } from '@/lib/search-url';
import { DataError, getCurrentUser, searchExternal, searchOpportunities } from '@/server/data';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}): Promise<Metadata> {
  const query = parseSearch(await searchParams);
  const filtered = Object.keys(query).length > 0;
  return {
    title: query.q
      ? `${query.q}: jobs, courses and apprenticeships`
      : 'Find jobs, apprenticeships, courses and support',
    description:
      'Search thousands of UK jobs, apprenticeships, courses, training and support services, and filter by place, sector, level, cost and pay.',
    alternates: { canonical: '/search' },
    // The plain search page is indexable; every filtered view is a duplicate of it.
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const query = parseSearch(await searchParams);
  const [user, response] = await Promise.all([
    getCurrentUser(),
    searchOpportunities(query).catch((error: unknown) => {
      if (error instanceof DataError) return error;
      throw error;
    }),
  ]);
  const signedIn = user !== null;

  if (response instanceof DataError) {
    return (
      <div className="page py-10">
        <h1 className="text-title">Find opportunities</h1>
        <Alert tone="danger" title="Search is not working right now" className="mt-6 max-w-2xl">
          <p>
            Something went wrong on our side. Nothing you did caused it. Please{' '}
            <Link className="font-semibold underline" href={searchHref(query)}>
              try again
            </Link>{' '}
            in a moment.
          </p>
        </Alert>
      </div>
    );
  }

  const filters = activeFilters(query);
  const hrefFor = (page: number) =>
    searchHref({ ...query, page: page > 1 ? page : undefined } as SearchQuery);
  const now = new Date();
  const heading = query.q ? `Results for “${query.q}”` : 'Find opportunities';
  const where = response.centre ? ` near ${response.centre.label}` : '';

  return (
    <div className="page py-8 sm:py-10">
      <h1 className="text-title mb-6">{heading}</h1>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[18.5rem_1fr]">
        <SearchForm query={query} facets={response.facets} />

        <section
          aria-labelledby="results-heading"
          className="min-w-0 lg:row-start-2 lg:col-start-2"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" role="status" className="text-lg font-bold">
              {countText(response.total, 'opportunity').replace('opportunitys', 'opportunities')}
              {where}
            </h2>
            <SortSelect
              value={
                query.sort ?? (query.q ? 'relevance' : response.centre ? 'distance' : 'newest')
              }
              hasLocation={response.centre !== null}
            />
          </div>

          {response.locationError ? (
            <Alert tone="warning" className="mb-4">
              {response.locationError}
            </Alert>
          ) : null}

          {filters.length > 0 ? (
            <ul aria-label="Active filters" className="mb-5 flex flex-wrap gap-2">
              {filters.map((f) => (
                <li key={f.key}>
                  <Link
                    href={f.removeHref}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-tint px-3 py-1 text-sm font-semibold text-primary no-underline hover:brightness-95"
                  >
                    {f.label}
                    <span aria-hidden>×</span>
                    <span className="sr-only">: remove this filter</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <PendingRegion>
            {response.items.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              <ul className="grid gap-4">
                {response.items.map((card) => (
                  <li key={card.id}>
                    <OpportunityCard card={card} signedIn={signedIn} now={now} />
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={response.page} totalPages={response.totalPages} hrefFor={hrefFor} />
          </PendingRegion>

          <Suspense fallback={<ExternalSkeleton />}>
            <ExternalSection query={query} signedIn={signedIn} now={now} />
          </Suspense>

          <ul className="mt-10 grid gap-1 text-sm text-ink-2">
            {response.attributions.map((a) => (
              <li key={a.providerName}>
                {a.url ? (
                  <a href={a.url} rel="noopener noreferrer" className="underline">
                    {a.text}
                  </a>
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: SearchQuery }) {
  const hasFilters = activeFilters(query).length > 0;
  return (
    <div className="grid justify-items-start gap-4 rounded-card border border-dashed border-field bg-surface p-8">
      <SearchX aria-hidden className="size-8 text-ink-2" />
      <h3 className="text-xl">We could not find anything that matches</h3>
      <ul className="grid list-disc gap-1 pl-5 text-ink-2">
        <li>
          Check the spelling, or try a simpler word (“care” instead of “care assistant jobs”).
        </li>
        {hasFilters ? <li>Take a filter off: use the × buttons above.</li> : null}
        {query.near ? <li>Try a bigger distance, or search a nearby town.</li> : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        {hasFilters || query.q || query.near ? (
          <Link href="/search" className={cn(buttonVariants({ variant: 'secondary' }))}>
            Start again
          </Link>
        ) : null}
        <Link href="/quiz" className={cn(buttonVariants({ variant: 'ghost' }))}>
          Not sure what to search for? Take a quiz
        </Link>
      </div>
    </div>
  );
}

function ExternalSkeleton() {
  return (
    <div className="mt-10 grid gap-3" aria-hidden>
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-32" />
    </div>
  );
}

/** Extra jobs from partner boards. Streams in after the main results; failing never breaks the page. */
async function ExternalSection({
  query,
  signedIn,
  now,
}: {
  query: SearchQuery;
  signedIn: boolean;
  now: Date;
}) {
  const external = await searchExternal(query).catch(() => null);
  if (!external || external.items.length === 0) return null;
  return (
    <section aria-labelledby="external-heading" className="mt-12">
      <h2 id="external-heading" className="text-xl font-bold">
        More jobs from other sites
      </h2>
      <p className="mt-1 text-ink-2">
        <ExternalLink aria-hidden className="mr-1 inline size-4" />
        These open on the job board’s own site.
      </p>
      <ul className="mt-4 grid gap-4">
        {external.items.map((card) => (
          <li key={card.id}>
            <OpportunityCard card={card} signedIn={signedIn} now={now} />
          </li>
        ))}
      </ul>
      <ul className="mt-3 grid gap-1 text-sm text-ink-2">
        {external.attributions.map((a) => (
          <li key={a.providerName}>
            {a.url ? (
              <a href={a.url} rel="noopener noreferrer nofollow" className="underline">
                {a.text}
              </a>
            ) : (
              a.text
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
