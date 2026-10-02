import { describe, expect, it } from 'vitest';
import { RequirementsSchema } from '../schemas/requirements';
import { extractRequirements, saysNoQualifications, titleSeniority } from './extract';

const read = (title: string, description: string, type = 'job') =>
  extractRequirements({ title, description, type });
const texts = (r: ReturnType<typeof read>, kind: string, essential = true) =>
  r.items.filter((i) => i.kind === kind && i.essential === essential).map((i) => i.text);

describe('"no experience needed": only believed when the advert says so', () => {
  it('trusts an explicit statement', () => {
    const r = read(
      'Exam Invigilator',
      'Support our exams team. No previous experience is necessary as full training is provided.\n\nApplicants must be 18 or over. An enhanced DBS check will be required.',
    );
    expect(r.experience).toMatchObject({ required: false, basis: 'text' });
    expect(r.experience.evidence).toMatch(/no previous experience/i);
  });

  it('does not treat "full training provided" as "no experience needed"', () => {
    const r = read(
      'Learning Support Assistant',
      'Join our inclusive school. Full training provided. You will support pupils in class.',
    );
    expect(r.experience.required).toBeNull();
  });

  it('does not treat a bare "no experience" about something else as a promise', () => {
    const r = read(
      'Care Assistant',
      'Applicants with no experience of night shifts are not a problem for us.',
    );
    expect(r.experience.required).toBeNull();
  });

  it('lets a senior title win over an encouraging line', () => {
    const r = read(
      '2iC Maths (KS5)',
      'No previous experience of leading a department is required. Full training is provided.',
    );
    expect(r.seniority).toBe('senior');
    expect(r.experience).toMatchObject({ required: true, basis: 'title' });
  });

  it.each([
    'Assistant Head of Year',
    'Assistant Headteacher',
    'Deputy Head (Pastoral)',
    'Head of Maths',
    'Chair of Governors',
    'Senior Teaching Assistant (Class Coordinator)',
    'Senior Operations Associate',
    'Finance and Strategy Senior Associate',
    'Team Leader',
    'Principal Engineer',
    'Account Manager',
  ])('treats "%s" as a role that needs experience', (title) => {
    const r = read(title, 'Join our team and make a difference.');
    expect(r.seniority).toBe('senior');
    expect(r.experience.required).toBe(true);
  });

  it.each([
    'Account Manager Apprentice',
    'Software Engineer Intern',
    'Graduate Analyst',
    'Trainee Electrician',
    'Placement Student',
    'School Leaver Programme',
    'Volunteer Befriender',
  ])('treats "%s" as an entry route', (title) => {
    const r = read(title, 'Join our team.');
    expect(r.seniority).toBe('entry');
    expect(r.experience).toMatchObject({ required: false, basis: 'title' });
  });

  it('does not decide for "Associate" or "Junior" titles', () => {
    expect(read('Customer Experience Associate', 'Join us.').experience.required).toBeNull();
    expect(read('Junior Planning Manager', 'Join us.').experience.required).toBeNull();
    expect(read('Cleaner', 'Join us.').experience.required).toBeNull();
  });

  it('lets an essential experience line beat an entry-sounding title', () => {
    const r = read(
      'Graduate Software Engineer',
      'Requirements\n\n• 2 years of professional experience is essential',
    );
    expect(r.experience).toMatchObject({ required: true, years: 2, basis: 'text' });
  });

  it('defaults entry routes (apprenticeships, courses) to no experience, unless the advert asks', () => {
    expect(read('Plumbing', 'A Level 2 course.', 'course').experience).toMatchObject({
      required: false,
      basis: 'type',
    });
    expect(read('Plumber', 'Join us.', 'apprenticeship').experience.required).toBe(false);
    const asks = read(
      'Plumber',
      'You will need:\n\n• 1 year of experience on site',
      'apprenticeship',
    );
    expect(asks.experience.required).toBe(true);
  });

  it.each([
    'Experience is not necessary.',
    'You do not need any previous experience.',
    "You don't need prior experience.",
    'Complete beginners welcome.',
    'No experience needed!',
    'No prior experience required.',
  ])('recognises: %s', (line) => {
    expect(read('Barista', line).experience).toMatchObject({ required: false, basis: 'text' });
  });
});

describe('qualifications', () => {
  it('reads GCSEs under a person specification, separating desirable from essential', () => {
    const r = read(
      'Teaching Assistant',
      `About you

• GCSE grade 4 or above in English and Maths
• Experience of working with children
• Good communication skills
• Ability to work as part of a team

Desirable

• Level 2 Teaching Assistant qualification
• First aid certificate`,
    );
    expect(r.minLevel).toBe(2);
    expect(texts(r, 'qualification')).toEqual(['GCSE grade 4 or above in English and Maths']);
    expect(texts(r, 'qualification', false)).toEqual(['Level 2 Teaching Assistant qualification']);
    expect(texts(r, 'experience')).toEqual(['Experience of working with children']);
    expect(r.experience).toMatchObject({ required: true, basis: 'text', years: null });
    expect(texts(r, 'skill')).toEqual(
      expect.arrayContaining(['Good communication skills', 'Ability to work as part of a team']),
    );
    expect(texts(r, 'check', false)).toEqual(['First aid certificate']);
  });

  it('reads an apprenticeship advert written by our own adapter', () => {
    const r = read(
      'Accounts Assistant Apprentice',
      `Kickstart your career in finance.

What you'll do:

• Prepare invoices
• Answer the phone

Skills they are looking for:

• Communication skills
• Attention to detail

You will need:

• Maths (GCSE, grade 4 / A - C)
• English (GCSE, grade 4 / A - C)

Helpful, but not required:

• Computer skills (Level 2 qualification)`,
      'apprenticeship',
    );
    expect(r.minLevel).toBe(2);
    expect(texts(r, 'qualification')).toHaveLength(2);
    expect(texts(r, 'skill')).toEqual(['Communication skills', 'Attention to detail']);
    expect(texts(r, 'qualification', false)).toEqual(['Computer skills (Level 2 qualification)']);
    // The "What you'll do" bullets are duties, not requirements.
    expect(r.items.map((i) => i.text)).not.toContain('Prepare invoices');
  });

  it('reads a tech advert: years, degree "or equivalent", nice-to-haves', () => {
    const r = read(
      'Software Engineer',
      `Requirements

• 3+ years of experience in software engineering
• Bachelor's degree in Computer Science or equivalent practical experience
• Strong communication skills

Nice to have

• Experience with Kubernetes`,
    );
    expect(r.minLevel).toBe(6);
    expect(r.equivalentAccepted).toBe(true);
    expect(r.experience).toMatchObject({ required: true, years: 3, basis: 'text' });
    expect(texts(r, 'experience', false)).toEqual(['Experience with Kubernetes']);
  });

  it('does not invent a degree requirement', () => {
    expect(read('Analyst', 'No degree needed. You will need:\n\n• Curiosity').minLevel).toBeNull();
    expect(read('Analyst', 'We value a high degree of accuracy.').minLevel).toBeNull();
  });

  it('reads Qualified Teacher Status as degree level, but not when it is not required', () => {
    expect(
      read('Teacher of Maths', 'You will need:\n\n• Qualified Teacher Status (QTS)').minLevel,
    ).toBe(6);
    expect(
      read('Teacher of Maths', 'Requirements\n\n• Unqualified teachers welcome; QTS not required')
        .minLevel,
    ).toBeNull();
  });

  it('treats "or equivalent experience" as an equivalence note, not an experience requirement', () => {
    const r = read('Technician', 'Requirements\n\n• Level 3 diploma or equivalent experience');
    expect(r.minLevel).toBe(3);
    expect(r.equivalentAccepted).toBe(true);
    expect(texts(r, 'experience')).toEqual([]);
  });
});

describe('checks and age', () => {
  it('finds statutory checks in boilerplate paragraphs anywhere in the advert', () => {
    const r = read(
      'Teaching Assistant',
      'We are committed to safeguarding children.\n\nThis post is subject to an enhanced DBS check and you must have the right to work in the UK.',
    );
    expect(texts(r, 'check')).toEqual(
      expect.arrayContaining(['Enhanced DBS check', 'Right to work in the UK']),
    );
  });

  it('only counts a driving licence when the advert asks for it', () => {
    expect(texts(read('Driver', 'You must hold a full driving licence.'), 'check')).toEqual([
      'Full driving licence',
    ]);
    expect(
      read(
        'Driver',
        'We provide a van and a friendly team. Some days involve driving licence checks of others.',
      ).items,
    ).toEqual([]);
  });

  it('reads minimum age', () => {
    const r = read('Bar Staff', 'Applicants must be 18 or over to apply.');
    expect(r.minAge).toBe(18);
    expect(r.items.find((i) => i.kind === 'age')?.text).toBe('You must be 18 or over');
    expect(read('Trainee', 'You must be 16 or over.').minAge).toBe(16);
    expect(read('Trainee', 'The course lasts 18 months.').minAge).toBeNull();
  });
});

describe('course entry requirements', () => {
  it('reads "no specific entry requirements" as no qualifications needed', () => {
    const r = read(
      'ESOL Skills for Life (Entry 2)',
      'Entry requirements:\n\nThere are no specific recommended prior learning requirements for this qualification.',
      'course',
    );
    expect(r.minLevel).toBe(0);
    expect(r.stated).toBe(true);
    expect(r.items[0]).toMatchObject({ kind: 'qualification', essential: true, level: 0 });
  });

  it.each([
    'No formal qualifications needed.',
    'No previous learning is required.',
    'Open to everyone.',
    'There are no entry requirements.',
  ])('recognises: %s', (line) => {
    expect(saysNoQualifications(line)).toBe(true);
    expect(read('Introduction to Care', line, 'course').minLevel).toBe(0);
  });

  it('does not mistake "no experience required" for "no qualifications required"', () => {
    expect(saysNoQualifications('No experience required.')).toBe(false);
    expect(read('Barista', 'No experience required.').minLevel).toBeNull();
  });

  it('still reads a real requirement after a "no formal" line', () => {
    const r = read(
      'Level 3 Diploma',
      'Entry requirements:\n\n• A Level 2 qualification in English and Maths\n• No previous experience is necessary',
      'course',
    );
    expect(r.minLevel).toBe(2);
  });

  it('reads the minimum age from "aged 19 and above"', () => {
    expect(
      read(
        'Certificate',
        'This qualification is suitable for learners aged 19 and above.',
        'course',
      ).minAge,
    ).toBe(19);
    expect(read('Course', 'Open to learners 16 and over.', 'course').minAge).toBe(16);
  });

  // The cases below are real provider wording from the National Careers Service course directory.
  describe('real provider wording', () => {
    it('does not read the adapter\'s "Key details" facts as requirements', () => {
      const r = read(
        'Award in ESOL',
        'A course for adults.\n\nKey details:\n\n• Provider: City College\n• Type: Essential skills\n• Starts: flexible, ask the provider',
        'course',
      );
      expect(r.items).toEqual([]);
    });

    it('skips "how you will be assessed" too', () => {
      const r = read(
        'Certificate',
        'How you will be assessed:\n\n• You must complete a portfolio of at least three pieces of work',
        'course',
      );
      expect(r.items).toEqual([]);
    });

    it('treats "Entry Level 3" as the entry rung (level 0), not level 3', () => {
      const r = read(
        'ESOL Writing (Level 2)',
        'Entry requirements:\n\nYou must have achieved an Entry Level 3 ESOL Writing qualification (or equivalent) before the course.',
        'course',
      );
      expect(r.minLevel).toBe(0);
      expect(r.equivalentAccepted).toBe(true);
    });

    it('still reads a real level beside an entry rung', () => {
      const r = read(
        'Course',
        'Entry requirements:\n\nYou need Entry Level 3 English and a GCSE grade 3 in maths.',
        'course',
      );
      expect(r.minLevel).toBe(2);
    });

    it('does not turn an exclusion into a requirement (Multiply)', () => {
      const r = read(
        'Managing Your Money',
        'Entry requirements:\n\naged 19+, live in North Yorkshire, have the right to live and work in the UK, and don?t have a GCSE Grade 4/C or equivalent',
        'course',
      );
      expect(r.minLevel).toBeNull();
      expect(r.minAge).toBe(19);
      expect(texts(r, 'qualification')).toEqual([]);
    });

    it('does not turn a "do not have" a degree line into a degree requirement', () => {
      const r = read(
        'Skills course',
        'Requirements\n\nYou do not already have a degree.',
        'course',
      );
      expect(r.minLevel).toBeNull();
    });

    it('takes the level of the GCSEs, not of the A level being applied for', () => {
      const r = read(
        'GCE A Level in Sociology',
        'Entry requirements:\n\nThe required entry requirements for A Level are a minimum of 5 GCSEs at grades 9 - 5. This must include a grade 5 in English Language.',
        'course',
      );
      expect(r.minLevel).toBe(2);
    });

    it('does not read the course being studied as the requirement ("to study A Level")', () => {
      const r = read(
        'A Level Maths',
        'Entry requirements:\n\nTo study A Level Maths you need 5 GCSEs including maths at grade 6.',
        'course',
      );
      expect(r.minLevel).toBe(2);
    });

    it('does not read "such as a Level 2 NVQ" as an AS level', () => {
      const r = read(
        'Diploma in Trowel Occupations',
        'Entry requirements:\n\nCandidates must provide evidence of verifiable competence, such as a Level 2 NVQ.',
        'course',
      );
      expect(r.minLevel).toBe(2);
    });

    it('does not believe "no national entry requirements" (T Levels: the college decides)', () => {
      const line = 'There are no national entry requirements for starting a T Level.';
      expect(saysNoQualifications(line)).toBe(false);
      const r = read(
        'T Level in Media',
        `Entry requirements:\n\n${line} These are set by the individual college or school.`,
        't-level',
      );
      expect(r.minLevel).toBeNull();
      expect(r.items).toEqual([]);
    });

    it('does not believe "no formal qualifications, but …"', () => {
      expect(
        saysNoQualifications('No formal qualifications, but you must pass an assessment.'),
      ).toBe(false);
      expect(
        saysNoQualifications(
          'Entry requirements vary: no formal qualifications are needed for some routes.',
        ),
      ).toBe(false);
      expect(saysNoQualifications('No formal qualifications are needed.')).toBe(true);
    });
  });
});

describe('not a requirement', () => {
  it('ignores employer boasts and duties', () => {
    const r = read(
      'Care Assistant',
      `About us

We have over 20 years of experience in the care sector and our team is growing.

What you'll do:

• Support residents with daily living
• Experience of dementia care is part of every day here`,
    );
    expect(r.items.filter((i) => i.kind === 'experience')).toEqual([]);
    expect(r.experience.required).toBeNull();
    expect(r.stated).toBe(false);
  });

  it('reports a silent advert as not stated, never as "no requirements"', () => {
    const r = read('Cleaner', 'Join our friendly team.');
    expect(r).toMatchObject({ stated: false, minLevel: null, items: [] });
    expect(r.experience.required).toBeNull();
  });
});

describe('shape and safety', () => {
  it('always produces something the schema accepts', () => {
    for (const [title, description, type] of [
      ['', '', 'job'],
      ['X', 'Requirements\n\n' + '• GCSE Maths\n'.repeat(60), 'job'],
      ['Head of Year', 'Essential: degree. '.repeat(200), 'job'],
      ['Intern', 'Nice to have\n\n• Python\n• SQL\n• R', 'internship'],
    ] as const) {
      const r = read(title, description, type);
      expect(RequirementsSchema.safeParse(r).success, title).toBe(true);
    }
  });

  it('caps the list so one rambling advert cannot flood it', () => {
    const r = read(
      'Clerk',
      `Requirements\n\n${'• GCSE Maths grade 4\n'.repeat(5)}${'• Skill number\n'.repeat(1)}`,
    );
    expect(r.items.length).toBeLessThanOrEqual(16);
    expect(texts(r, 'qualification').length).toBeLessThanOrEqual(4);
  });

  it('is fast on very long adverts', () => {
    const long = `Requirements\n\n${'• You must have experience of working in a busy team with 3 years of practice. '.repeat(400)}`;
    const t0 = performance.now();
    read('Engineer', long);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('classifies titles', () => {
    expect(titleSeniority('Head Chef')).toBe('senior');
    expect(titleSeniority('Apprentice Chef')).toBe('entry');
    expect(titleSeniority('Chef')).toBe('unknown');
  });
});
