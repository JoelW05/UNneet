import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { CurrentUser } from '@/server/data';
import { DesktopNav, MobileNav, SavedLink } from './nav';

export function SiteHeader({ user }: { user: CurrentUser | null }) {
  return (
    <header className="no-print relative z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="page flex min-h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-4 xl:gap-8">
          <Logo />
          <DesktopNav />
        </div>
        <div className="flex items-center gap-1">
          <SavedLink signedIn={user !== null} />
          <ThemeToggle />
          {user ? (
            <Link
              href="/account"
              className={cn(buttonVariants({ variant: 'secondary' }), 'hidden sm:inline-flex')}
            >
              Your account
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: 'secondary' }), 'hidden sm:inline-flex')}
            >
              Sign in
            </Link>
          )}
          <MobileNav signedIn={user !== null} />
        </div>
      </div>
    </header>
  );
}
