'use client';

import { Heart, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSaved } from '@/features/saved/saved-store';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/lib/local-store';

export const NAV_ITEMS = [
  { href: '/search', label: 'Find opportunities' },
  { href: '/quiz', label: 'Quizzes' },
  { href: '/pathways', label: 'Career pathways' },
  { href: '/timeline', label: 'Your timeline' },
  { href: '/support', label: 'Help & support' },
] as const;

const isCurrent = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const current = isCurrent(pathname, href);
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 font-semibold no-underline hover:bg-surface-2',
        current ? 'bg-primary-tint text-primary' : 'text-ink',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function DesktopNav() {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} href={item.href}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A disclosure menu for small screens: a real button, aria-expanded, closes on navigation. */
export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: closing on route change is the point
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="xl:hidden">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((o) => !o)}
        className="px-3"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        <span>{open ? 'Close menu' : 'Menu'}</span>
      </Button>
      <nav
        id="mobile-nav"
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-line bg-surface p-3 shadow-lift"
      >
        <ul className="page grid gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} className="w-full text-lg">
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink href="/saved" className="w-full text-lg">
              Saved
            </NavLink>
          </li>
          <li>
            <NavLink href={signedIn ? '/account' : '/sign-in'} className="w-full text-lg">
              {signedIn ? 'Your account' : 'Sign in'}
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** The saved-items link with a live count. The count only appears after hydration (it is per-browser). */
export function SavedLink({ signedIn }: { signedIn: boolean }) {
  const { items } = useSaved(signedIn);
  const hydrated = useHydrated();
  const count = hydrated ? items.length : 0;
  return (
    <Link
      href="/saved"
      className={cn(buttonVariants({ variant: 'ghost' }), 'hidden gap-2 px-3 sm:inline-flex')}
    >
      <Heart aria-hidden className="size-5" />
      <span>Saved</span>
      {count > 0 ? (
        <span className="rounded-full bg-primary px-2 text-sm font-bold text-primary-ink">
          <span className="sr-only">: </span>
          {count}
        </span>
      ) : null}
    </Link>
  );
}
