import type { NextConfig } from 'next';

/** Where the Hono API lives. Server-side only: the browser always talks to this site's own origin. */
const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The workspace packages ship TypeScript source.
  transpilePackages: ['@unneet/domain', '@unneet/content', '@unneet/api-client'],

  /**
   * The browser only ever talks to THIS origin. Next proxies the API paths, so session cookies are
   * first-party (no CORS, no third-party-cookie problems) and the API stays off the public
   * internet in production if you want it to.
   */
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${API_URL}/v1/:path*` },
      { source: '/api/auth/:path*', destination: `${API_URL}/api/auth/:path*` },
      { source: '/api-docs', destination: `${API_URL}/docs` },
      { source: '/openapi.json', destination: `${API_URL}/openapi.json` },
    ];
  },

  /**
   * Static security headers. The Content-Security-Policy is NOT here: it needs a fresh nonce per
   * request, so it is set in src/proxy.ts.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default config;
