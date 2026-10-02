/** The public origin, for canonical URLs, Open Graph tags and the sitemap. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

export const absoluteUrl = (path: string): string =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
