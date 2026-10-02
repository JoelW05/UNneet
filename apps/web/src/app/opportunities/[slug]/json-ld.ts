import { annualRange, type OpportunityDetail } from '@unneet/domain';
import { absoluteUrl } from '@/lib/site';

const EMPLOYMENT: Record<string, string> = {
  job: 'FULL_TIME',
  apprenticeship: 'OTHER',
  internship: 'INTERN',
};

/**
 * schema.org JobPosting, so jobs can appear in Google for Jobs. Only emitted for real, open
 * listings (never samples or expired ones), and only for the employment-type opportunities.
 * https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
export function jobPostingJsonLd(o: OpportunityDetail): Record<string, unknown> | null {
  if (!(o.type in EMPLOYMENT)) return null;
  const annual = annualRange(o.pay);
  const isRemote = o.location.workMode === 'remote';
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: o.title,
    description: o.description,
    datePosted: (o.postedAt ?? o.updatedAt).slice(0, 10),
    ...(o.closesAt ? { validThrough: o.closesAt } : {}),
    employmentType: o.tags.includes('part-time') ? 'PART_TIME' : EMPLOYMENT[o.type],
    hiringOrganization: {
      '@type': 'Organization',
      name: o.organisation.name,
      ...(o.organisation.url ? { sameAs: o.organisation.url } : {}),
    },
    ...(isRemote
      ? {
          jobLocationType: 'TELECOMMUTE',
          applicantLocationRequirements: { '@type': 'Country', name: 'GB' },
        }
      : {
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: o.location.label,
              ...(o.location.postcode ? { postalCode: o.location.postcode } : {}),
              addressCountry: 'GB',
            },
          },
        }),
    ...(annual.min !== null || annual.max !== null
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'GBP',
            value: {
              '@type': 'QuantitativeValue',
              ...(annual.min !== null ? { minValue: annual.min } : {}),
              ...(annual.max !== null ? { maxValue: annual.max } : {}),
              unitText: 'YEAR',
            },
          },
        }
      : {}),
    directApply: false,
    url: absoluteUrl(`/opportunities/${o.slug}`),
  };
}
