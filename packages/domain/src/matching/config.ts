import type { Goal } from '../taxonomy/misc';
import type { OpportunityType } from '../taxonomy/opportunity-types';
import type { Weights } from './types';

/**
 * Feature weights. Each feature scores 0–1; when the profile has no data for a feature it is
 * dropped and the remaining weights are renormalised, so a person who only gave a postcode still
 * gets sensible results. Tuned by hand; the evaluation harness in matching/engine.test.ts pins
 * behaviour so changes here are deliberate.
 */
export const DEFAULT_WEIGHTS: Weights = {
  skills: 0.26,
  interest: 0.2,
  values: 0.08,
  level: 0.12,
  location: 0.14,
  budget: 0.06,
  goal: 0.1,
  freshness: 0.04,
};

/** How well each opportunity type serves each goal (0–1). */
export const GOAL_TYPE_AFFINITY: Readonly<Record<Goal, Readonly<Record<OpportunityType, number>>>> =
  {
    'earn-now': {
      job: 1,
      apprenticeship: 0.8,
      internship: 0.5,
      traineeship: 0.4,
      bootcamp: 0.3,
      volunteering: 0.1,
      course: 0.1,
      't-level': 0.05,
      degree: 0,
      programme: 0.5,
      support: 0.3,
    },
    'earn-and-learn': {
      apprenticeship: 1,
      traineeship: 0.7,
      internship: 0.6,
      job: 0.5,
      bootcamp: 0.5,
      programme: 0.4,
      course: 0.3,
      volunteering: 0.25,
      't-level': 0.3,
      degree: 0.3,
      support: 0.2,
    },
    'learn-first': {
      course: 1,
      't-level': 1,
      degree: 0.9,
      bootcamp: 0.9,
      traineeship: 0.8,
      apprenticeship: 0.6,
      programme: 0.4,
      internship: 0.2,
      job: 0.1,
      volunteering: 0.15,
      support: 0.2,
    },
    experience: {
      volunteering: 1,
      internship: 1,
      traineeship: 0.8,
      programme: 0.7,
      apprenticeship: 0.6,
      job: 0.5,
      bootcamp: 0.4,
      course: 0.3,
      't-level': 0.3,
      degree: 0.1,
      support: 0.3,
    },
    explore: {
      programme: 0.8,
      support: 0.7,
      volunteering: 0.7,
      course: 0.6,
      bootcamp: 0.6,
      traineeship: 0.6,
      internship: 0.6,
      apprenticeship: 0.6,
      job: 0.5,
      't-level': 0.5,
      degree: 0.5,
    },
  };

export const GOAL_REASON: Readonly<Record<Goal, Partial<Record<OpportunityType, string>>>> = {
  'earn-now': {
    job: 'A paid job you could start soon',
    apprenticeship: 'You get paid from day one',
  },
  'earn-and-learn': {
    apprenticeship: 'Earn a wage while you train',
    traineeship: 'Free training that leads to work',
  },
  'learn-first': {
    course: 'Study first, then work',
    't-level': 'A technical qualification with work placement',
    bootcamp: 'Fast, job-focused training',
  },
  experience: {
    volunteering: 'A good way to build experience',
    internship: 'Real work experience',
    traineeship: 'Includes a work placement',
  },
  explore: {
    programme: 'A low-pressure way to explore options',
    support: 'Free advice to help you decide',
  },
};

/** Defaults and tuning knobs for ranking. */
export const DEFAULT_LIMIT = 24;
export const DEFAULT_EXPLORE_SHARE = 0.15;
export const DEFAULT_RELEVANCE_WEIGHT = 0.8;
/** Default travel limit when the person hasn't said. */
export const DEFAULT_MAX_TRAVEL_MILES = 15;
