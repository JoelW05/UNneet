# ADR-0006: Timeline rules are data; dated events are sourced and expire

- Status: accepted · Date: 2026-10-01 · Origin: product request ("prompt people to apply for internships as soon as they start 2nd year")

## Context
Missed windows are a major, avoidable cause of people not getting onto the path they want. UK cycles are
a mix of **fixed national deadlines** and **typical, employer-driven windows**:

- UCAS 2027-entry equal-consideration deadline is **13 Jan 2027, 18:00**; 15 Oct 2026 for Oxbridge/medicine/dentistry/vet
  ([UCAS](https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546)).
- Teacher-training applications open **6 Oct 2026**, close **21 Sep 2027**
  ([GOV.UK](https://www.gov.uk/government/publications/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates)).
- Student finance for courses starting on/after 1 Jan 2027 opens end Oct 2026; for 2026/27 you can apply up to 9 months after the year starts
  ([GOV.UK](https://www.gov.uk/apply-online-for-student-finance)).
- Graduate schemes: peak Sep–Dec, tests Dec–Feb, assessment centres Feb–Apr, reopen May–Jun; rolling recruitment, Fast Stream can close as early as Oct
  ([University of York careers](https://www.york.ac.uk/students/work-volunteering-careers/apply-interview/looking-for-work/job-toolkit/time-frames/)).
- School-leaver apprenticeship vacancies appear all year; busiest roughly Mar–Sep; some employers recruit from autumn
  ([GC Education & Skills](http://www.gceducationandskills.ac.uk/news/when-to-apply-for-a-school-leaver-apprenticeship)).
- You can leave school on the last Friday in June at 16, but must stay in education/training (or work/volunteer 20h+ with part-time study, or an apprenticeship) until 18
  ([GOV.UK](https://www.gov.uk/know-when-you-can-leave-school)).

Hard-coding any of this in components would rot silently; UCAS' own deadline moved earlier for 2027.

## Decision
1. Rules and calendar are **data** (`packages/content/src/timeline`) validated by Zod schemas in `domain`.
2. A **pure engine** (`domain/timeline`) maps `(stage, date, doneIds)` → `now / soon / later / missed / done`.
3. `fixed` events carry `sourceUrl`, `verifiedOn`, `cycle`. A CI test fails when no verified event exists for the
   upcoming cycle within 90 days of its start, and the UI **hides** unverified/expired fixed dates.
4. `academic` windows are labelled "typically" and carry a source; copy never promises outcomes.
5. Stage is stored on the profile with the academic year it was set; each September the UI *asks* before advancing.
6. Delivery v1: on-site + stateless `.ics` feed (carries only a stage). E-mail reminders are opt-in, 16+, phase 2.

## Consequences
+ Editors (not engineers) can update the calendar each cycle; staleness is caught by CI.
+ Engine is trivially testable with a fake clock.
− Someone must own the yearly calendar refresh (documented in `docs/RUNBOOK.md`).
− "Typical" windows are generalisations; mitigated by wording + per-listing deadlines taking precedence in the UI.
