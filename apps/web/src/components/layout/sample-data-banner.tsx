import { FlaskConical } from 'lucide-react';

/** Shown whenever demo listings are in the catalogue. Fake listings must never pass as real. */
export function SampleDataBanner() {
  return (
    <div className="no-print border-b border-warning/40 bg-warning-tint text-ink">
      <p className="page flex items-start gap-2 py-2 text-sm">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          <strong className="text-warning">Demo data.</strong> Some listings on this site are
          labelled samples used for testing. They are not real vacancies. Real listings always link
          to their original source.
        </span>
      </p>
    </div>
  );
}
