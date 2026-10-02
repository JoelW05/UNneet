import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Personal and filtered views are not useful to index.
        disallow: ['/account', '/saved', '/results', '/profile', '/sign-in', '/v1/', '/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
