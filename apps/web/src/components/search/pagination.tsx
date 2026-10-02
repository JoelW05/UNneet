import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Pages to show: first, last, and a window around the current page, with gaps as null. */
export function pageWindow(current: number, total: number, around = 1): Array<number | null> {
  const pages = new Set<number>([1, total]);
  for (let p = current - around; p <= current + around; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (const [i, p] of sorted.entries()) {
    const prev = sorted[i - 1];
    if (i > 0 && prev !== undefined && p - prev > 1) out.push(null);
    out.push(p);
  }
  return out;
}

const item =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-3 font-semibold no-underline';

/** Server-rendered pagination: plain links (crawlable, work without JS), current page marked. */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={cn(item, 'gap-1 hover:bg-surface-2')}>
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Link>
      ) : null}
      <ul className="flex flex-wrap items-center gap-1">
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-ink-2">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}${p === page ? ', current page' : ''}`}
                className={cn(
                  item,
                  p === page ? 'bg-primary text-primary-ink' : 'hover:bg-surface-2',
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={cn(item, 'gap-1 hover:bg-surface-2')}>
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
