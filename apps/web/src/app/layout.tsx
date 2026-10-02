import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { SampleDataBanner } from '@/components/layout/sample-data-banner';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeScript } from '@/components/theme/theme-toggle';
import { ClientSync } from '@/features/sync/client-sync';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/present';
import { SITE_URL } from '@/lib/site';
import { getCurrentUser, getStats } from '@/server/data';
import './globals.css';

/**
 * Atkinson Hyperlegible Next: designed by the Braille Institute for maximum character
 * distinction and legibility, so it is easier to read for people with low vision or dyslexia.
 * Self-hosted by next/font (no request to Google at runtime).
 */
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  variable: '--font-atkinson',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: find your next step`, template: `%s · ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_GB',
    title: `${SITE_NAME}: find your next step`,
    description: SITE_TAGLINE,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1f' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The nonce set by src/proxy.ts, so our one inline script satisfies the strict CSP.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const [user, stats] = await Promise.all([getCurrentUser(), getStats().catch(() => null)]);

  return (
    // data-theme is set before hydration by ThemeScript, hence suppressHydrationWarning.
    <html lang="en-GB" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ClientSync signedIn={user !== null} />
        {stats?.sampleData ? <SampleDataBanner /> : null}
        <SiteHeader user={user} />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
