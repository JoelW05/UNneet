import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The wordmark: "NEET" struck through. NEET is the label this site exists to move people past, so
 * the mark crosses it out. The visible text is decorative-free: assistive tech just hears "UnNEET".
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-baseline text-2xl font-extrabold tracking-tight', className)}
    >
      <span>Un</span>
      <span className="strike">NEET</span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="UnNEET, home"
      className={cn('rounded-control px-1 py-1 text-ink no-underline', className)}
    >
      <LogoMark />
    </Link>
  );
}
