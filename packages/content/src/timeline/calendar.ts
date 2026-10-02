import { type CalendarEvent, CalendarEventSchema } from '@unneet/domain';

/**
 * Dated national events for the CURRENT cycle. These are the only facts the timeline presents as
 * exact, so every entry needs an official source and a `verifiedOn` date. Unverified events are
 * hidden from users by the engine, and `calendar.test.ts` fails when the upcoming cycle has no
 * verified events, so this file cannot silently go stale.
 *
 * Refresh checklist (each summer): docs/RUNBOOK.md → "Refreshing the timeline calendar".
 */
const RAW: CalendarEvent[] = [
  {
    id: 'ucas-2027-oct',
    cycle: 'ucas-2027-entry',
    label: 'UCAS deadline: Oxford, Cambridge, medicine, dentistry and veterinary courses',
    closes: '2026-10-15',
    closesAtTime: '18:00',
    source: {
      label: 'UCAS: 2027 entry deadline (Oxford, Cambridge, most medicine, vet and dentistry)',
      url: 'https://www.ucas.com/events/2027-entry-deadline-for-the-universities-of-oxford-and-cambridge-and-most-courses-in-medicine-475536',
    },
    verifiedOn: '2026-10-01',
    note: 'Applications must reach UCAS by 18:00 UK time to get equal consideration.',
  },
  {
    id: 'ucas-2027-jan',
    cycle: 'ucas-2027-entry',
    label: 'UCAS equal-consideration deadline for all other undergraduate courses',
    closes: '2027-01-13',
    closesAtTime: '18:00',
    source: {
      label: 'UCAS: 2027 entry deadline (all courses except 15 October)',
      url: 'https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546',
    },
    verifiedOn: '2026-10-01',
    note: 'Universities don’t have to consider later applications, but can if they have places left.',
  },
  {
    id: 'teacher-training-2026-27',
    cycle: 'teacher-training-2026-27',
    label: 'Teacher training applications (2026 to 2027 cycle)',
    opens: '2026-10-06',
    closes: '2027-09-21',
    closesAtTime: '18:00',
    source: {
      label: 'GOV.UK: Recruiting postgraduate trainee teachers, recruitment cycle dates',
      url: 'https://www.gov.uk/government/publications/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates/recruiting-postgraduate-trainee-teachers-recruitment-cycle-dates',
    },
    verifiedOn: '2026-10-01',
    note: 'Applications open 6 October 2026 at 9am. Apply early: popular courses can fill.',
  },
];

export const CALENDAR_EVENTS: readonly CalendarEvent[] = RAW.map((e) =>
  CalendarEventSchema.parse(e),
);
