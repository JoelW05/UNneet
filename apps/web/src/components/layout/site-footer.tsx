import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';

const LINKS = {
  Find: [
    { href: '/search?pillar=employment', label: 'Jobs' },
    { href: '/search?type=apprenticeship', label: 'Apprenticeships' },
    { href: '/search?pillar=education', label: 'Courses and degrees' },
    { href: '/search?pillar=training', label: 'Training and bootcamps' },
    { href: '/search?type=volunteering', label: 'Volunteering' },
  ],
  'Work out your next step': [
    { href: '/quiz', label: 'Quizzes' },
    { href: '/profile', label: 'Your profile and CV' },
    { href: '/results', label: 'Your matches' },
    { href: '/pathways', label: 'Career pathways' },
    { href: '/timeline', label: 'Your timeline' },
  ],
  'About UnNEET': [
    { href: '/about', label: 'About us' },
    { href: '/about/credits', label: 'Data sources and credits' },
    { href: '/for-providers', label: 'For colleges and employers' },
    { href: '/api-docs', label: 'Developer API' },
  ],
  Legal: [
    { href: '/privacy', label: 'Privacy' },
    { href: '/accessibility', label: 'Accessibility' },
    { href: '/cookies', label: 'Cookies and storage' },
    { href: '/terms', label: 'Terms of use' },
  ],
} as const;

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-line bg-surface-2">
      <div className="page grid gap-10 py-12 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="grid content-start gap-3">
          <LogoMark />
          <p className="max-w-xs text-ink-2">
            One place to find a job, apprenticeship, course or support, wherever you are starting
            from.
          </p>
        </div>
        {Object.entries(LINKS).map(([heading, links]) => (
          <nav key={heading} aria-label={heading} className="grid content-start gap-2">
            <h2 className="eyebrow">{heading}</h2>
            <ul className="grid gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-8 items-center text-ink underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="page grid gap-3 py-6 text-sm text-ink-2 md:grid-cols-[1fr_auto] md:items-center">
          <p>
            <strong className="text-ink">Struggling right now?</strong> You can talk to someone for
            free, any time: call Samaritans on{' '}
            <a className="font-semibold text-ink underline" href="tel:116123">
              116 123
            </a>{' '}
            or text SHOUT to{' '}
            <a className="font-semibold text-ink underline" href="sms:85258?body=SHOUT">
              85258
            </a>
            .{' '}
            <Link href="/support" className="font-semibold text-ink underline">
              More help
            </Link>
            .
          </p>
          <p>Listings link to the original source. Always check details with the provider.</p>
        </div>
      </div>
    </footer>
  );
}
