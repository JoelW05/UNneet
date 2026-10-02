import { type NextRequest, NextResponse } from 'next/server';

/**
 * A strict Content-Security-Policy with a fresh nonce for every request.
 *
 * - `script-src` allows only our own scripts and ones carrying this request's nonce
 *   (`strict-dynamic` lets those load their dependencies), so an injected <script> cannot run.
 * - `style-src` is `self` + nonce. React's `style={{}}` attributes need `style-src-attr`: that
 *   only permits attributes (they cannot run script), not <style> blocks.
 * - Nothing may frame the site, submit forms elsewhere, or load plugins.
 *
 * Because the nonce is per request, every page is rendered dynamically (see the Next.js CSP guide).
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. The proxied API paths, static assets and the API docs carry their own headers.
      source: '/((?!v1|api|api-docs|openapi.json|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
