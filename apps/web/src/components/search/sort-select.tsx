'use client';

import { SORT_LABEL, SORTS, type Sort } from '@unneet/domain';
import { Select } from '@/components/ui/field';

/**
 * Sorting joins the search form from outside it (`form="search-form"`), so choosing "Newest"
 * keeps every filter. Changing it submits the form.
 */
export function SortSelect({ value, hasLocation }: { value: Sort; hasLocation: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="whitespace-nowrap text-ink-2">
        Sort by
      </label>
      <Select
        id="sort"
        name="sort"
        form="search-form"
        defaultValue={value}
        className="w-auto"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {SORTS.filter((s) => s !== 'distance' || hasLocation).map((s) => (
          <option key={s} value={s}>
            {SORT_LABEL[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}
