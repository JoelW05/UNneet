import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="page grid justify-items-start gap-5 py-20">
      <p className="eyebrow">Error 404</p>
      <h1 className="text-title">We could not find that page</h1>
      <p className="max-w-xl text-lg text-ink-2">
        It may have moved, or the link might be out of date. Listings also disappear once they
        close. Try searching instead.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/search" className={cn(buttonVariants({ size: 'lg' }))}>
          Search opportunities
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
