import {
  ArrowRight,
  BriefcaseBusiness,
  ClipboardList,
  GraduationCap,
  Hammer,
  HeartHandshake,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { NextUp } from '@/features/timeline/next-up';
import { cn } from '@/lib/cn';
import { getPathways, getStats, type PathwaySummary, type Stats } from '@/server/data';

export const metadata: Metadata = {
  title: { absolute: 'UnNEET: find your next step. Jobs, apprenticeships, courses and support' },
  alternates: { canonical: '/' },
};

const PILLARS = [
  {
    key: 'employment',
    title: 'Work',
    blurb: 'Jobs, internships and volunteering, from your first job to your next one.',
    href: '/search?pillar=employment',
    Icon: BriefcaseBusiness,
    tone: 'text-employment bg-employment-tint',
  },
  {
    key: 'education',
    title: 'Study',
    blurb: 'Colleges, sixth forms, T Levels and degrees near you.',
    href: '/search?pillar=education',
    Icon: GraduationCap,
    tone: 'text-education bg-education-tint',
  },
  {
    key: 'training',
    title: 'Train',
    blurb: 'Apprenticeships and bootcamps: earn while you learn.',
    href: '/search?pillar=training',
    Icon: Hammer,
    tone: 'text-training bg-training-tint',
  },
  {
    key: 'support',
    title: 'Get support',
    blurb: 'Free advice, mentoring and wellbeing help, when you need a hand.',
    href: '/search?pillar=support',
    Icon: HeartHandshake,
    tone: 'text-support bg-support-tint',
  },
] as const;

const QUICK = [
  { label: 'Apprenticeships', href: '/search?type=apprenticeship' },
  { label: 'No experience needed', href: '/search?noExperience=1' },
  { label: 'Free courses', href: '/search?pillar=education&free=1' },
  { label: 'Volunteering', href: '/search?type=volunteering' },
  { label: 'Work from home', href: '/search?workMode=remote' },
];

const STEPS = [
  {
    Icon: ClipboardList,
    title: 'Tell us a bit about you',
    text: 'Take a short quiz, add your skills, or drop in your CV. Everything stays in your browser unless you choose to sign in.',
    href: '/quiz',
    cta: 'Start a quiz',
  },
  {
    Icon: Sparkles,
    title: 'See what fits, and why',
    text: 'Matches come with plain reasons: “uses skills you have”, “free”, “near you”. No mystery scores.',
    href: '/results',
    cta: 'See your matches',
  },
  {
    Icon: Timer,
    title: 'Know when to act',
    text: 'Deadlines and best times to apply, for exactly where you are: Year 11, uni, between jobs, anything.',
    href: '/timeline',
    cta: 'Open your timeline',
  },
];

export default async function HomePage() {
  const [stats, pathways] = await Promise.all([
    getStats().catch((): Stats | null => null),
    getPathways().catch((): PathwaySummary[] => []),
  ]);
  const count = (pillar: string) => stats?.byPillar.find((p) => p.value === pillar)?.count;

  return (
    <>
      <section className="hero-glow border-b border-line">
        <div className="page grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="grid gap-6">
            <p className="eyebrow">For anyone in the UK, especially 16 to 24</p>
            <h1 className="text-display">
              Find your <span className="whitespace-nowrap">next step.</span>
            </h1>
            <p className="max-w-xl text-xl text-ink-2">
              Jobs, apprenticeships, courses, training and support, all in one place. Free to use,
              with no sign-up.
            </p>

            <search aria-label="Search opportunities">
              <form
                action="/search"
                method="get"
                className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-lift sm:grid-cols-[1.4fr_1fr_auto] sm:items-end"
              >
                <Field label="What are you looking for?">
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="search"
                      name="q"
                      placeholder="e.g. plumbing, care, coding"
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field label="Where?">
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="text"
                      name="near"
                      placeholder="Town or postcode"
                      autoComplete="postal-code"
                    />
                  )}
                </Field>
                <Button type="submit" size="lg" className="sm:mb-px">
                  <Search aria-hidden className="size-5" />
                  Search
                </Button>
              </form>
            </search>

            <ul className="flex flex-wrap gap-2" aria-label="Popular searches">
              {QUICK.map((q) => (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink no-underline hover:bg-surface-2"
                  >
                    {q.label}
                  </Link>
                </li>
              ))}
            </ul>

            {stats ? (
              <p className="text-ink-2">
                <strong className="text-ink">{stats.open.toLocaleString('en-GB')}</strong> real
                opportunities from{' '}
                <strong className="text-ink">
                  {stats.sources.filter((s) => !s.isSample).length}
                </strong>{' '}
                sources, and counting.
              </p>
            ) : null}
          </div>

          <NextUp />
        </div>
      </section>

      <section aria-labelledby="pillars-heading" className="page py-16">
        <h2 id="pillars-heading" className="text-title mb-2">
          Work, study, train, or get support
        </h2>
        <p className="mb-8 max-w-2xl text-ink-2">
          There is more than one way forward. Start with whichever feels closest, and change your
          mind any time.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ key, title, blurb, href, Icon, tone }) => {
            const n = count(key);
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="group grid h-full content-start gap-3 rounded-card border border-line bg-surface p-5 text-ink no-underline shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className={cn('grid size-12 place-items-center rounded-control', tone)}>
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="text-xl font-bold">{title}</span>
                  <span className="text-ink-2">{blurb}</span>
                  <span className="mt-auto flex items-center gap-1.5 font-semibold text-primary">
                    {n !== undefined ? `${n.toLocaleString('en-GB')} to explore` : 'Explore'}
                    <ArrowRight
                      aria-hidden
                      className="size-4 transition group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-line bg-surface-2">
        <div className="page py-16">
          <h2 id="how-heading" className="text-title mb-8">
            Not sure where to start? Start here.
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(({ Icon, title, text, href, cta }, i) => (
              <li key={title}>
                <Card className="h-full">
                  <CardBody className="grid h-full content-start gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-full bg-primary text-lg font-bold text-primary-ink">
                        {i + 1}
                      </span>
                      <Icon aria-hidden className="size-6 text-ink-2" />
                    </div>
                    <h3 className="text-xl">{title}</h3>
                    <p className="text-ink-2">{text}</p>
                    <Link
                      href={href}
                      className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'mt-auto justify-self-start',
                      )}
                    >
                      {cta}
                    </Link>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {pathways.length > 0 ? (
        <section aria-labelledby="paths-heading" className="page py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="paths-heading" className="text-title">
                Career pathways
              </h2>
              <p className="mt-1 max-w-2xl text-ink-2">
                Routes into a career, from “no experience needed” to established, each step linked
                to real opportunities.
              </p>
            </div>
            <Link href="/pathways" className={buttonVariants({ variant: 'secondary' })}>
              See all pathways
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pathways.slice(0, 6).map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/pathways/${p.slug}`}
                  className="grid h-full content-start gap-2 rounded-card border border-line bg-surface p-5 text-ink no-underline shadow-card transition hover:shadow-lift"
                >
                  <span className="text-xl font-bold">{p.title}</span>
                  <span className="text-ink-2">{p.blurb}</span>
                  <span className="mt-1 text-sm text-ink-2">
                    Start with: <span className="text-ink">{p.startingPoint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="trust-heading" className="page pb-4">
        <div className="grid gap-6 rounded-card border border-line bg-surface p-6 shadow-card sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
          <ShieldCheck aria-hidden className="size-12 text-support" />
          <div className="grid gap-2">
            <h2 id="trust-heading" className="text-2xl">
              Built to be on your side
            </h2>
            <p className="max-w-3xl text-ink-2">
              We will never label you. You do not need an account. Your CV is read in memory and
              never stored. Every listing links to its original source, and we tell you where our
              data comes from.{' '}
              <Link href="/about" className="font-semibold text-primary underline">
                How we work
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
