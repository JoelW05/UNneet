'use client';

import { type Likert, SECTORS } from '@unneet/domain';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, Progress } from '@/components/ui/feedback';
import type { InterestsQuiz } from '@/lib/api-types';
import { browserApi } from '@/lib/browser-api';
import { cn } from '@/lib/cn';
import { useProfile } from '../profile/profile-store';

interface ScoreResult {
  riasec: { R: number; I: number; A: number; S: number; E: number; C: number };
  code: string;
  answered: number;
  total: number;
  reliable: boolean;
  types: Array<{ type: string; name: string; description: string; score: number }>;
  sectors: Array<{ sector: string; fit: number }>;
}

const STORAGE_KEY = 'unneet.quiz.interests.v1';

function loadAnswers(): Record<string, Likert> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Likert>) : {};
  } catch {
    return {};
  }
}

const sectorName = (slug: string) => SECTORS.find((s) => s.slug === slug)?.name ?? slug;

/**
 * The interests quiz, one question at a time. Answers survive a refresh (session storage only,
 * cleared when the tab closes), nothing is sent until the end, and the result is scored by the API
 * (a stateless call) and kept in the visitor's profile.
 */
export function InterestsQuizApp({ quiz }: { quiz: InterestsQuiz }) {
  const { update } = useProfile();
  const [phase, setPhase] = useState<'intro' | 'asking' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Likert>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const total = quiz.items.length;
  const item = quiz.items[index];
  const answered = Object.keys(answers).length;

  useEffect(() => {
    const saved = loadAnswers();
    if (Object.keys(saved).length > 0) setAnswers(saved);
  }, []);

  // Move focus to the new question so screen-reader users hear it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus whenever the step or phase changes
  useEffect(() => {
    if (phase !== 'intro') headingRef.current?.focus();
  }, [index, phase]);

  const choose = (id: string, value: Likert) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // blocked: answers stay in memory for this visit
      }
      return next;
    });
  };

  const finish = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const { data } = await browserApi.POST('/v1/quizzes/interests/score', { body: { answers } });
      if (!data) throw new Error('no data');
      const scored = data as unknown as ScoreResult;
      setResult(scored);
      update({ riasec: scored.riasec });
      setPhase('result');
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [answers, update]);

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setResult(null);
    setPhase('asking');
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (phase === 'intro') {
    const resuming = answered > 0;
    return (
      <div className="grid max-w-2xl gap-5">
        <p className="text-lg text-ink-2">{quiz.intro}</p>
        <ul className="grid list-disc gap-1 pl-5 text-ink-2">
          <li>
            {total} short questions, about {quiz.estimatedMinutes} minutes.
          </li>
          <li>You can skip any you are unsure about.</li>
          <li>
            Your answers stay in your browser. We only send them to be scored, and do not keep them.
          </li>
        </ul>
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => {
              const firstUnanswered = quiz.items.findIndex((i) => answers[i.id] === undefined);
              setIndex(resuming && firstUnanswered > 0 ? firstUnanswered : 0);
              setPhase('asking');
            }}
          >
            {resuming ? `Carry on (${answered} of ${total} done)` : 'Start the quiz'}
          </Button>
          {resuming ? (
            <Button size="lg" variant="ghost" onClick={restart}>
              Start again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === 'result' && result) {
    const top = result.types
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return (
      <div className="grid gap-8">
        <div className="grid gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-3xl outline-none">
            Your interests: <span className="whitespace-nowrap">{result.code}</span>
          </h2>
          <p className="max-w-2xl text-lg text-ink-2">
            These are the kinds of activities you said you would enjoy most. It is a starting point
            for ideas, not a verdict: interests change, and you can do well at things outside your
            code.
          </p>
        </div>

        {!result.reliable ? (
          <Alert tone="warning" title="A rough picture">
            You skipped quite a few questions, so this is less reliable. You can{' '}
            <button type="button" className="font-semibold underline" onClick={restart}>
              retake the quiz
            </button>{' '}
            any time.
          </Alert>
        ) : null}

        <section aria-labelledby="types-heading" className="grid gap-3">
          <h3 id="types-heading" className="text-xl">
            What you enjoy most
          </h3>
          <ol className="grid gap-3 md:grid-cols-3">
            {top.map((t) => (
              <li
                key={t.type}
                className="grid content-start gap-1 rounded-card border border-line bg-surface p-5 shadow-card"
              >
                <span className="text-sm font-bold text-ink-2">
                  {t.type} · {Math.round(t.score * 100)}%
                </span>
                <span className="text-xl font-bold">{t.name}</span>
                <span className="text-ink-2">{t.description}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="sectors-heading" className="grid gap-3">
          <h3 id="sectors-heading" className="text-xl">
            Areas of work that match your interests
          </h3>
          <ol className="grid gap-3">
            {result.sectors.slice(0, 6).map((s) => (
              <li
                key={s.sector}
                className="grid gap-1.5 rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{sectorName(s.sector)}</span>
                  <Link
                    href={`/search?sector=${s.sector}`}
                    className="font-semibold text-primary underline"
                  >
                    See opportunities<span className="sr-only"> in {sectorName(s.sector)}</span>
                  </Link>
                </div>
                <Progress
                  value={Math.round(s.fit * 100)}
                  max={100}
                  label={`${sectorName(s.sector)}: ${Math.round(s.fit * 100)} out of 100`}
                />
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/results" className={cn(buttonVariants({ size: 'lg' }))}>
            See jobs and courses that fit
            <ArrowRight aria-hidden className="size-5" />
          </Link>
          <Link href="/quiz" className={cn(buttonVariants({ size: 'lg', variant: 'secondary' }))}>
            More quizzes
          </Link>
          <Button size="lg" variant="ghost" onClick={restart}>
            <RotateCcw aria-hidden className="size-4" />
            Retake
          </Button>
        </div>
        <p className="max-w-2xl text-sm text-ink-2">{quiz.attribution}</p>
      </div>
    );
  }

  if (!item) return null;
  const current = answers[item.id];
  const last = index === total - 1;

  return (
    <form
      className="grid max-w-3xl gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (last) void finish();
        else setIndex((i) => i + 1);
      }}
    >
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-ink-2" aria-live="polite">
          Question {index + 1} of {total}
        </p>
        <Progress value={index + 1} max={total} label={`Question ${index + 1} of ${total}`} />
      </div>

      <fieldset className="grid gap-5">
        <legend className="mb-1 w-full">
          <span className="block text-sm font-semibold text-ink-2">
            How much would you enjoy this?
          </span>
          <span
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 block text-2xl font-bold leading-snug text-ink outline-none sm:text-3xl"
          >
            {item.text}
          </span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-5">
          {quiz.scale.map((option) => {
            const checked = current === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-control border-2 px-4 py-3 font-semibold sm:flex-col sm:justify-center sm:text-center',
                  checked
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-field bg-surface hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name={`q-${item.id}`}
                  value={option.value}
                  checked={checked}
                  onChange={() => choose(item.id, option.value as Likert)}
                  className="size-5 shrink-0 accent-primary"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <Alert tone="danger" title="We could not score your answers">
          Please check your connection and try again. Your answers are still here.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          <ArrowLeft aria-hidden className="size-5" />
          Back
        </Button>
        <Button
          type="submit"
          size="lg"
          loading={busy}
          disabled={current === undefined && answered === 0 && last}
        >
          {last ? 'See my results' : current === undefined ? 'Skip' : 'Next'}
          <ArrowRight aria-hidden className="size-5" />
        </Button>
      </div>
    </form>
  );
}
