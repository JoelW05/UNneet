'use client';

import {
  activeFilterCount,
  type Facets,
  OPPORTUNITY_TYPE_INFO,
  OPPORTUNITY_TYPES,
  QUALIFICATION_LEVELS,
  SECTORS,
  type SearchQuery,
  WORK_MODE_LABEL,
  WORK_MODES,
} from '@unneet/domain';
import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Choice, Field, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { LEVEL_RANGES, levelRangeOf, searchFromFormData } from '@/lib/search-url';
import { setSearchPending } from './pending';

const RADII = [5, 10, 20, 30, 50, 100];
const PAY_STEPS = [15_000, 20_000, 25_000, 30_000, 40_000, 50_000];
const COST_STEPS = [250, 500, 1_000, 2_500, 5_000];

const count = (buckets: Array<{ value: string; count: number }>, value: string): number =>
  buckets.find((b) => b.value === value)?.count ?? 0;

function Group({
  legend,
  children,
  className,
}: {
  legend: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('grid gap-1 border-t border-line pt-4', className)}>
      <legend className="mb-1 font-bold text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}

function CountLabel({ label, n }: { label: string; n: number }) {
  return (
    <>
      {label} <span className="text-ink-2">({n.toLocaleString('en-GB')})</span>
    </>
  );
}

/**
 * The search bar and filters, as ONE real `<form method="get">`: it works with JavaScript off,
 * and with it on, filters apply instantly (checkboxes and selects submit on change; text fields
 * submit on Enter). Results live in the page, not here, so this component only renders the form
 * controls (`display: contents` lets the page lay them out in its own grid).
 *
 * The form's id lets controls elsewhere on the page (the sort menu) join it with `form="search-form"`.
 */
export function SearchForm({ query, facets }: { query: SearchQuery; facets: Facets }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeCount = activeFilterCount(query);

  const submit = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    startTransition(() => router.push(searchFromFormData(new FormData(form))));
  }, [router]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearTimeout(timer.current);
    submit();
  };

  // Instant filtering for discrete controls only; typing into a text box waits for Enter.
  const onChange = (event: FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const discrete =
      target.tagName === 'SELECT' ||
      (target.tagName === 'INPUT' &&
        ['checkbox', 'radio'].includes((target as HTMLInputElement).type));
    if (!discrete) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(submit, 250);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setSearchPending(pending);
    return () => setSearchPending(false);
  }, [pending]);

  const selectedTypes = new Set(query.type ?? []);
  const selectedSectors = new Set(query.sector ?? []);
  const selectedModes = new Set(query.workMode ?? []);
  const types = OPPORTUNITY_TYPES.filter((t) => selectedTypes.has(t) || count(facets.type, t) > 0);
  const sectors = SECTORS.filter(
    (s) => selectedSectors.has(s.slug) || count(facets.sector, s.slug) > 0,
  );

  return (
    <form
      id="search-form"
      ref={formRef}
      action="/search"
      method="get"
      onSubmit={onSubmit}
      onChange={onChange}
      aria-busy={pending}
      className="contents"
    >
      <search
        aria-label="Search opportunities"
        className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end lg:col-span-2"
      >
        <Field label="What are you looking for?">
          {(a11y) => (
            <Input
              {...a11y}
              type="search"
              name="q"
              defaultValue={query.q ?? ''}
              placeholder="A job, course or skill, e.g. plumbing"
              autoComplete="off"
              enterKeyHint="search"
            />
          )}
        </Field>
        <Field label="Where?">
          {(a11y) => (
            <Input
              {...a11y}
              type="text"
              name="near"
              defaultValue={query.near ?? ''}
              placeholder="Town, city or postcode"
              autoComplete="postal-code"
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={pending}>
          Search
        </Button>
      </search>

      <div className="lg:row-start-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full lg:hidden"
          aria-expanded={filtersOpen}
          aria-controls="filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>

        <div
          id="filters"
          className={cn('mt-4 grid gap-4 lg:mt-0', filtersOpen ? 'grid' : 'hidden lg:grid')}
        >
          <Group legend="Type" className="border-t-0 pt-0 lg:border-t-0">
            {types.map((t) => (
              <Choice
                key={t}
                type="checkbox"
                name="type"
                value={t}
                defaultChecked={selectedTypes.has(t)}
                label={
                  <CountLabel label={OPPORTUNITY_TYPE_INFO[t].plural} n={count(facets.type, t)} />
                }
              />
            ))}
          </Group>

          <Group legend="Sector">
            <details open={selectedSectors.size > 0} className="group">
              <summary className="min-h-11 cursor-pointer list-none rounded-control py-2 font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {sectors.length} sectors</span>
                <span className="hidden group-open:inline">Hide sectors</span>
              </summary>
              {sectors.map((s) => (
                <Choice
                  key={s.slug}
                  type="checkbox"
                  name="sector"
                  value={s.slug}
                  defaultChecked={selectedSectors.has(s.slug)}
                  label={<CountLabel label={s.name} n={count(facets.sector, s.slug)} />}
                />
              ))}
            </details>
          </Group>

          <Group legend="Level">
            <Field label="Qualification level" className="[&>label]:sr-only">
              {(a11y) => (
                <Select {...a11y} name="levelRange" defaultValue={levelRangeOf(query)}>
                  {LEVEL_RANGES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Only things I can start now"
              hint="Your highest qualification so far"
              className="mt-2"
            >
              {(a11y) => (
                <Select {...a11y} name="qualified" defaultValue={query.qualified?.toString() ?? ''}>
                  <option value="">Show everything</option>
                  {QUALIFICATION_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      I have: {l.haveLabel}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Group>

          <Group legend="Cost and pay">
            <Choice
              type="checkbox"
              name="free"
              value="1"
              defaultChecked={Boolean(query.free)}
              label={<CountLabel label="Free to you" n={facets.free} />}
              description="Includes courses that are free if you qualify"
            />
            <Field label="Most you want to pay" className="mt-2">
              {(a11y) => (
                <Select {...a11y} name="costMax" defaultValue={query.costMax?.toString() ?? ''}>
                  <option value="">No limit</option>
                  {COST_STEPS.map((n) => (
                    <option key={n} value={n}>
                      Up to £{n.toLocaleString('en-GB')}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Pay (a year, full-time equivalent)" className="mt-2">
              {(a11y) => (
                <Select {...a11y} name="payMin" defaultValue={query.payMin?.toString() ?? ''}>
                  <option value="">Any</option>
                  {PAY_STEPS.map((n) => (
                    <option key={n} value={n}>
                      £{n.toLocaleString('en-GB')} or more
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Group>

          <Group legend="Where you would work">
            {WORK_MODES.map((m) => (
              <Choice
                key={m}
                type="checkbox"
                name="workMode"
                value={m}
                defaultChecked={selectedModes.has(m)}
                label={<CountLabel label={WORK_MODE_LABEL[m]} n={count(facets.workMode, m)} />}
              />
            ))}
            <Field label="Distance from where you searched" className="mt-2">
              {(a11y) => (
                <Select {...a11y} name="radius" defaultValue={query.radius?.toString() ?? ''}>
                  <option value="">Within 20 miles</option>
                  {RADII.map((r) => (
                    <option key={r} value={r}>
                      Within {r} miles
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Group>

          <Group legend="About you">
            <Choice
              type="checkbox"
              name="noExperience"
              value="1"
              defaultChecked={Boolean(query.noExperience)}
              label="No experience needed"
            />
            <Field
              label="My age"
              optional
              hint="Hides things you are too young or old for"
              className="mt-2"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  type="number"
                  name="age"
                  min={14}
                  max={99}
                  inputMode="numeric"
                  defaultValue={query.age ?? ''}
                  className="max-w-28"
                />
              )}
            </Field>
          </Group>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" className="flex-1">
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                startTransition(() =>
                  router.push(
                    query.q || query.near
                      ? `/search?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.near ? { near: query.near } : {}) })}`
                      : '/search',
                  ),
                )
              }
            >
              Clear filters
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
