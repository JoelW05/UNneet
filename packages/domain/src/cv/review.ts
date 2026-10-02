import { experienceGaps } from '../schemas/history';
import type { CvExtraction } from '../skills/cv';
import type { CvHistory } from './history';

/**
 * A CV review: explainable checks, not a score. Every finding says WHAT we noticed, WHY it
 * matters, and HOW to fix it, in plain language that never blames. The tone matters: for many
 * people this is the first CV they have ever written, so we lead with what is good.
 *
 * All checks run on the text in memory; nothing about the person's contact details leaves this
 * function (we only learn whether an e-mail address and a phone number are present).
 */
export type Priority = 'high' | 'medium' | 'low';

export interface ReviewFinding {
  id: string;
  priority: Priority;
  title: string;
  /** What we noticed and why it matters. */
  detail: string;
  /** What to do about it. */
  fix?: string;
}

export interface ReviewStrength {
  id: string;
  title: string;
  detail: string;
}

export interface CvStats {
  words: number;
  /** Rough A4 pages at ~450 words a page. */
  pages: number;
  bulletPoints: number;
  numbersInExperience: number;
  /** Share (0–1) of experience bullet points that start with an action verb. */
  actionVerbShare: number | null;
  skillsFound: number;
  experienceEntries: number;
  educationEntries: number;
}

export interface CvReview {
  headline: string;
  stats: CvStats;
  strengths: ReviewStrength[];
  improvements: ReviewFinding[];
}

const BULLET = /^\s*[•*·▪●○◦\-–—]\s+/;

const ACTION_VERBS = new Set(
  `achieved acted added administered advised answered arranged assembled assisted attended balanced booked built carried checked cleaned coached collected communicated completed cooked coordinated counted created cut delivered designed developed dealt drove earned edited encouraged ensured entertained established explained filed fixed greeted guided handled helped identified improved increased installed kept launched learned led maintained managed measured mentored monitored motivated moved operated organised organized packed painted performed planned prepared presented processed produced provided raised recorded recruited reduced repaired reported resolved restocked reviewed sold served set shared sorted started supervised supported taught tested trained translated updated used volunteered welcomed wrote`.split(
    /\s+/,
  ),
);

const CLICHES: ReadonlyArray<readonly [string, RegExp]> = [
  ['hard-working', /\bhard[- ]?working\b/i],
  ['team player', /\bteam player\b/i],
  [
    'excellent communication skills',
    /\b(excellent|good|strong) (communication|interpersonal) skills\b/i,
  ],
  ['self-motivated', /\bself[- ]?motivated\b/i],
  ['fast learner', /\b(fast|quick) learner\b/i],
  ['detail-oriented', /\bdetail[- ]?(oriented|orientated)\b/i],
  ['go-getter', /\bgo[- ]getter\b/i],
  ['results-driven', /\bresults[- ]?driven\b/i],
  ['think outside the box', /\bthink(ing)? outside (of )?the box\b/i],
  ['passionate', /\bpassionate (about|individual|and)\b/i],
  ['dynamic', /\bdynamic (individual|person|and)\b/i],
];

const SHOULD_REMOVE =
  /\b(date of birth|d\.?o\.?b\.?|marital status|nationality|religion|gender|national insurance(?: number)?|ni number)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+44\s?\d|\b0)\d[\d\s()-]{8,13}\d/;
const NUMBER = /(?:£\s?\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%|\b\d{1,5}\b)/g;

const firstWord = (s: string): string =>
  (s.replace(BULLET, '').trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const monthName = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export function reviewCv(
  text: string,
  extraction: CvExtraction,
  history: CvHistory,
  now: Date,
): CvReview {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const words = extraction.wordCount;
  const pages = Math.round((words / 450) * 10) / 10;
  const hasSection = (s: string) => history.sections.includes(s as never);

  const experienceText = history.experience.map((e) => e.description ?? '').join('\n');
  const bulletLines = lines.filter((l) => BULLET.test(l));
  const describing = history.experience.flatMap((e) =>
    (e.description ?? '').split(/(?<=[.!?])\s+/).filter((s) => s.length > 3),
  );
  const verbSource = bulletLines.length > 0 ? bulletLines : describing;
  const actionVerbShare =
    verbSource.length >= 3
      ? verbSource.filter((l) => ACTION_VERBS.has(firstWord(l))).length / verbSource.length
      : null;
  const numbersInExperience = (experienceText.match(NUMBER) ?? []).filter(
    (n) => !/^(19|20)\d{2}$/.test(n.trim()),
  ).length;

  const clichesFound = CLICHES.filter(([, re]) => re.test(text)).map(([label]) => label);
  const firstPerson = lines.filter((l) => /^(i|i'm|i am|my)\b/i.test(l)).length;
  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const shouldRemove = text.match(SHOULD_REMOVE)?.[0];
  const gaps = experienceGaps(history.experience, now).filter((g) => g.months >= 9);

  const stats: CvStats = {
    words,
    pages,
    bulletPoints: bulletLines.length,
    numbersInExperience,
    actionVerbShare: actionVerbShare === null ? null : Math.round(actionVerbShare * 100) / 100,
    skillsFound: extraction.skills.length,
    experienceEntries: history.experience.length,
    educationEntries: history.education.length,
  };

  const improvements: ReviewFinding[] = [];
  const strengths: ReviewStrength[] = [];
  const add = (f: ReviewFinding) => improvements.push(f);
  const good = (s: ReviewStrength) => strengths.push(s);

  // --- basics an employer needs ------------------------------------------------------------
  if (!hasEmail) {
    add({
      id: 'contact-email',
      priority: 'high',
      title: 'Add an email address',
      detail:
        'We could not find an email address. An employer who likes your CV needs a way to reach you.',
      fix: 'Put a professional-looking email (name@…, not a nickname) near the top, plus a phone number if you are happy to be called.',
    });
  } else if (!hasPhone) {
    add({
      id: 'contact-phone',
      priority: 'low',
      title: 'Consider adding a phone number',
      detail: 'Some employers prefer to ring, especially for hands-on jobs.',
      fix: 'Add a number you will answer, and make sure your voicemail greeting sounds professional.',
    });
  } else {
    good({
      id: 'contact',
      title: 'Easy to contact',
      detail: 'Your email and phone are there. Employers can reach you.',
    });
  }

  if (shouldRemove) {
    add({
      id: 'remove-personal',
      priority: 'medium',
      title: 'Take out personal details you do not need',
      detail: `Your CV mentions “${shouldRemove.toLowerCase()}”. UK employers do not need it, and leaving it out helps keep hiring fair.`,
      fix: 'Remove date of birth, marital status, nationality, religion and similar. Keep it to your name and contact details.',
    });
  }

  // --- length and layout -------------------------------------------------------------------
  if (words < 120) {
    add({
      id: 'length-short',
      priority: 'high',
      title: 'Add more detail',
      detail: `At about ${words} words there is not much for an employer to go on.`,
      fix: 'Aim for around 250 to 500 words: a short summary, your education, anything you have done (jobs, volunteering, school roles, projects) and your skills.',
    });
  } else if (words < 220) {
    add({
      id: 'length-light',
      priority: 'low',
      title: 'You could say a bit more',
      detail: `About ${words} words is a little light.`,
      fix: 'Add one or two bullet points under each thing you have done, saying what you actually did.',
    });
  } else if (words > 800) {
    add({
      id: 'length-long',
      priority: 'high',
      title: 'Shorten your CV',
      detail: `At about ${words} words it runs to roughly ${pages} pages. Most employers skim a CV in under a minute.`,
      fix: 'Keep it to one or two pages. Cut older or less relevant things, and keep your best three or four points per role.',
    });
  } else if (words > 650) {
    add({
      id: 'length-long',
      priority: 'medium',
      title: 'It is on the long side',
      detail: `About ${words} words is around ${pages} pages.`,
      fix: 'Two pages is plenty. Trim older roles to a line or two.',
    });
  } else {
    good({
      id: 'length',
      title: 'A good length',
      detail: `About ${words} words fits comfortably on one or two pages.`,
    });
  }

  // --- structure ---------------------------------------------------------------------------
  if (!hasSection('education') && history.education.length === 0) {
    add({
      id: 'section-education',
      priority: 'high',
      title: 'Add an education section',
      detail: 'We could not find your education or qualifications.',
      fix: 'List where you studied and what you got (or are working towards), most recent first. If you do not have formal qualifications yet, say what you are studying or planning.',
    });
  } else {
    good({
      id: 'section-education',
      title: 'Education is covered',
      detail: 'Your education is easy to find.',
    });
  }

  if (history.experience.length === 0 && !hasSection('experience') && !hasSection('volunteering')) {
    add({
      id: 'section-experience',
      priority: 'medium',
      title: 'Show what you have done, not just what you have studied',
      detail:
        'We could not find any work or volunteering. Employers want to see you have done something real, and it does not need to be a paid job.',
      fix: 'Add anything you have done: a Saturday job, work experience, volunteering, helping at a family business, caring for someone, school or club roles, projects. All of it counts.',
    });
  } else if (history.experience.some((e) => e.kind === 'volunteering')) {
    good({
      id: 'volunteering',
      title: 'You have volunteering on there',
      detail: 'Volunteering shows initiative and reliability, which employers value a lot.',
    });
  }

  if (!hasSection('profile')) {
    add({
      id: 'section-profile',
      priority: 'low',
      title: 'Start with a two or three line summary',
      detail:
        'A short summary at the top tells the reader who you are and what you are after, before they read the rest.',
      fix: 'For example: “Friendly, reliable school leaver with retail experience, looking for a first role in care. Strong at teamwork and keeping calm.” Make it specific to the job.',
    });
  } else {
    good({
      id: 'section-profile',
      title: 'You open with a summary',
      detail: 'A short summary at the top helps the reader straight away.',
    });
  }

  if (!hasSection('skills') && extraction.skills.length >= 3) {
    add({
      id: 'section-skills',
      priority: 'low',
      title: 'Pull your skills into one place',
      detail: `We spotted ${extraction.skills.length} skills in your CV (like ${extraction.skills
        .slice(0, 3)
        .map((s) => s.label.toLowerCase())
        .join(', ')}), but they are scattered.`,
      fix: 'Add a short “Skills” section listing the ones that matter for the job you want, so they stand out.',
    });
  } else if (hasSection('skills')) {
    good({
      id: 'section-skills',
      title: 'Skills are easy to find',
      detail: 'A skills section helps employers and screening tools spot what you offer.',
    });
  }

  // --- how well it is written --------------------------------------------------------------
  if (history.experience.length > 0 && numbersInExperience === 0) {
    add({
      id: 'numbers',
      priority: 'medium',
      title: 'Add some numbers',
      detail: 'Numbers make what you did real: they show scale and results.',
      fix: 'For example: “served around 80 customers a shift”, “raised £250 for charity”, “looked after a team of 4 volunteers”. Even rough, honest numbers help.',
    });
  } else if (numbersInExperience >= 2) {
    good({
      id: 'numbers',
      title: 'You use numbers',
      detail: 'Figures make your experience concrete and believable.',
    });
  }

  if (actionVerbShare !== null && actionVerbShare < 0.4) {
    add({
      id: 'action-verbs',
      priority: 'medium',
      title: 'Start your bullet points with action words',
      detail: 'Strong CVs start each point with what you did: “Served…”, “Organised…”, “Helped…”.',
      fix: 'Rewrite points like “Responsible for the till” as “Operated the till and balanced it at close”.',
    });
  } else if (actionVerbShare !== null && actionVerbShare >= 0.6) {
    good({
      id: 'action-verbs',
      title: 'Your points start with action words',
      detail: 'That makes it clear what you actually did.',
    });
  }

  if (clichesFound.length >= 2) {
    add({
      id: 'cliches',
      priority: 'medium',
      title: 'Show, do not just tell',
      detail: `Phrases like “${clichesFound.slice(0, 3).join('”, “')}” appear on almost every CV, so they do not stand out.`,
      fix: 'Back each one with a fact. Instead of “team player”, say “worked in a team of six to open the café on time every Saturday”.',
    });
  }

  if (firstPerson > 3) {
    add({
      id: 'first-person',
      priority: 'low',
      title: 'You can drop the “I”',
      detail: 'CVs usually leave out “I” and “my”, which saves space and reads more confidently.',
      fix: 'Change “I helped customers find products” to “Helped customers find products”.',
    });
  }

  if (/\breferences? (available )?(on|upon) request\b/i.test(text)) {
    add({
      id: 'references-line',
      priority: 'low',
      title: '“References available on request” is not needed',
      detail: 'Employers assume you can provide references, so the line only takes up space.',
      fix: 'Use that space for something more useful, like another skill or achievement.',
    });
  }

  // --- history -----------------------------------------------------------------------------
  for (const gap of gaps.slice(0, 2)) {
    add({
      id: `gap-${gap.from}`,
      priority: 'medium',
      title: 'Explain the gap in your history',
      detail: `There is nothing dated between ${monthName(gap.from)} and ${monthName(gap.to)} (about ${gap.months} months). Gaps are very common, and an unexplained one just makes a reader wonder.`,
      fix: 'Add one honest line about what you were doing: studying, caring for family, health, travelling, looking for work, or a short course. You do not need to give private details.',
    });
  }

  if (history.education.length > 0) {
    const mentionsBasics = /\b(maths|mathematics)\b/i.test(text) && /\benglish\b/i.test(text);
    if (history.education.some((e) => e.kind === 'gcse') && !mentionsBasics) {
      add({
        id: 'maths-english',
        priority: 'low',
        title: 'Mention Maths and English if you have them',
        detail: 'Many employers and courses ask for Maths and English at grade 4 or above.',
        fix: 'List them by name with your grades. If you do not have them yet, many colleges offer them free if you are 16 to 19, and you can say you are working towards them.',
      });
    }
  }

  if (extraction.skills.length >= 5) {
    good({
      id: 'skills-found',
      title: `${extraction.skills.length} skills come through clearly`,
      detail: `For example ${extraction.skills
        .slice(0, 4)
        .map((s) => s.label.toLowerCase())
        .join(', ')}.`,
    });
  } else if (extraction.skills.length === 0) {
    add({
      id: 'skills-none',
      priority: 'medium',
      title: 'Spell out your skills',
      detail:
        'We could not pick out specific skills. Screening software and recruiters look for them.',
      fix: 'Mention concrete skills: using a till, customer service, first aid, Excel, working in a team, a driving licence. Use the words from the job advert where they are true.',
    });
  }

  if (history.experience.some((e) => e.from) && history.experience.some((e) => e.to === null)) {
    good({
      id: 'current',
      title: 'You are doing something right now',
      detail: 'A current role or activity shows you are active and reliable.',
    });
  }
  if (history.experience.length > 0 && history.experience.every((e) => e.from)) {
    good({
      id: 'dated',
      title: 'Everything is dated',
      detail: 'Clear dates make your history easy to follow.',
    });
  }
  if (extraction.qualifications.found.length > 0) {
    good({
      id: 'qualifications',
      title: 'Your qualifications are visible',
      detail: `We found ${extraction.qualifications.found.map((q) => q.label).join(', ')}.`,
    });
  }

  improvements.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id.localeCompare(b.id),
  );

  const high = improvements.filter((i) => i.priority === 'high').length;
  const headline =
    improvements.length === 0
      ? 'This is a strong CV. Tailor it to each job you apply for and you are in good shape.'
      : high > 0
        ? `A start to build on: ${high} important thing${high === 1 ? '' : 's'} to fix first, then ${improvements.length - high} smaller improvement${improvements.length - high === 1 ? '' : 's'}.`
        : strengths.length >= 4
          ? `Good foundations. ${improvements.length} quick improvement${improvements.length === 1 ? '' : 's'} would make it stronger.`
          : `You have the basics. ${improvements.length} improvement${improvements.length === 1 ? '' : 's'} would help it stand out.`;

  return { headline, stats, strengths, improvements };
}
