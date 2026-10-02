/** Third-party content we must credit wherever it is used. Rendered on /about/credits and in the quiz. */
export interface Attribution {
  id: string;
  name: string;
  text: string;
  url: string;
  licence: string;
}

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    id: 'onet-mini-ip',
    name: 'O*NET® Mini Interest Profiler',
    text: 'The interests quiz is based on the O*NET® Mini Interest Profiler by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under a CC BY 4.0 licence. Item wording has been adapted for UK spelling and vocabulary and scores are mapped to UK sectors by UnNEET. USDOL/ETA has not approved or endorsed these changes. O*NET® is a trademark of USDOL/ETA.',
    url: 'https://www.onetcenter.org/dl_files/Mini-IP.pdf',
    licence: 'CC BY 4.0',
  },
  {
    id: 'skills-england',
    name: 'Skills England occupational routes',
    text: 'Sector names follow the 15 occupational routes published by Skills England. © Skills England 2025. Licensed under the Open Government Licence v3.0.',
    url: 'https://occupational-maps.skillsengland.education.gov.uk/',
    licence: 'OGL v3.0',
  },
  {
    id: 'rqf-levels',
    name: 'GOV.UK qualification levels',
    text: 'Qualification level descriptions follow GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.',
    url: 'https://www.gov.uk/what-different-qualification-levels-mean/list-of-qualification-levels',
    licence: 'OGL v3.0',
  },
  {
    id: 'postcodes-io',
    name: 'postcodes.io',
    text: 'Postcode lookups by postcodes.io, containing Royal Mail, ONS and Ordnance Survey data.',
    url: 'https://postcodes.io/',
    licence: 'Open data',
  },
];
