import { Skeleton } from '@/components/ui/feedback';

export default function Loading() {
  return (
    <div className="page py-8 sm:py-10" aria-busy="true">
      <p role="status" className="sr-only">
        Loading results
      </p>
      <Skeleton className="mb-6 h-10 w-80 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[18.5rem_1fr]">
        <Skeleton className="h-20 lg:col-span-2" />
        <Skeleton className="hidden h-96 lg:block" />
        <div className="grid gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  );
}
