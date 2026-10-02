'use client';

import { SKILL_LEVEL_LABEL, SKILL_LEVELS } from '@unneet/domain';
import { Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Choice, Input, Select } from '@/components/ui/field';
import { useProfile } from '../profile/profile-store';

export interface SkillGroup {
  category: string;
  label: string;
  skills: Array<{ id: string; label: string; aliases: string[] }>;
}

/**
 * Pick the things you can do. A searchable list grouped by area, with a "how good are you"
 * level for each. Everything is saved to the profile as you go; the matcher uses these to score
 * how well a role fits.
 */
export function SkillsPicker({ groups }: { groups: SkillGroup[] }) {
  const { profile, hydrated, update } = useProfile();
  const [query, setQuery] = useState('');
  const searchId = useId();
  const chosen = new Map(profile.skills.map((s) => [s.id, s]));
  const q = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          skills: q
            ? g.skills.filter(
                (s) =>
                  s.label.toLowerCase().includes(q) ||
                  s.aliases.some((a) => a.toLowerCase().includes(q)),
              )
            : g.skills,
        }))
        .filter((g) => g.skills.length > 0),
    [groups, q],
  );
  const matches = visible.reduce((n, g) => n + g.skills.length, 0);

  const toggle = (skill: { id: string; label: string }, on: boolean) => {
    update((p) => ({
      ...p,
      skills: on
        ? [
            ...p.skills.filter((s) => s.id !== skill.id),
            { id: skill.id, label: skill.label, level: 2 as const },
          ].slice(0, 60)
        : p.skills.filter((s) => s.id !== skill.id),
    }));
  };
  const setLevel = (id: string, level: 1 | 2 | 3) =>
    update((p) => ({ ...p, skills: p.skills.map((s) => (s.id === id ? { ...s, level } : s)) }));

  return (
    <div className="grid gap-8">
      <section aria-labelledby="your-skills" className="grid gap-3">
        <h2 id="your-skills" className="text-2xl">
          Your skills{' '}
          {hydrated ? <span className="text-ink-2">({profile.skills.length})</span> : null}
        </h2>
        {profile.skills.length === 0 ? (
          <p className="text-ink-2">
            Nothing here yet. Tick some below, or import them from a CV on the profile page.
          </p>
        ) : (
          <ul className="grid gap-2">
            {profile.skills.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 pl-4"
              >
                <span className="mr-auto font-semibold">{s.label}</span>
                <label className="sr-only" htmlFor={`level-${s.id}`}>
                  How good are you at {s.label}?
                </label>
                <Select
                  id={`level-${s.id}`}
                  value={s.level}
                  onChange={(e) => setLevel(s.id, Number(e.target.value) as 1 | 2 | 3)}
                  className="w-auto min-w-40"
                >
                  {SKILL_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {SKILL_LEVEL_LABEL[l]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${s.label}`}
                  onClick={() => toggle(s, false)}
                >
                  <X aria-hidden className="size-5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-skills" className="grid gap-4">
        <h2 id="add-skills" className="text-2xl">
          Add skills
        </h2>
        <div className="grid max-w-md gap-1.5">
          <label htmlFor={searchId} className="font-semibold">
            Search for a skill
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-2"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. customer service, Excel, first aid"
              className="pl-11"
              autoComplete="off"
            />
          </div>
          <p role="status" aria-live="polite" className="text-sm text-ink-2">
            {q
              ? `${matches} skill${matches === 1 ? '' : 's'} match${matches === 1 ? 'es' : ''}`
              : 'Browse by area below.'}
          </p>
        </div>

        <div className="grid gap-3">
          {visible.map((g) => (
            <details
              key={g.category}
              open={Boolean(q)}
              className="group rounded-card border border-line bg-surface"
            >
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-lg font-bold [&::-webkit-details-marker]:hidden">
                <span>{g.label}</span>
                <span className="text-sm font-normal text-ink-2">{g.skills.length} skills</span>
              </summary>
              <ul className="grid gap-x-4 border-t border-line px-3 py-2 sm:grid-cols-2">
                {g.skills.map((s) => (
                  <li key={s.id}>
                    <Choice
                      type="checkbox"
                      checked={chosen.has(s.id)}
                      onChange={(e) => toggle(s, e.target.checked)}
                      label={s.label}
                    />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
