'use client';

import { useId } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SortOrder } from '@/lib/list-params';

export interface SortOption {
  sort: string;
  order: SortOrder;
  label: string;
}

interface ListSortSelectProps {
  sort: string;
  order: SortOrder;
  options: SortOption[];
  onChange: (sort: string, order: SortOrder) => void;
  label?: string;
  id?: string;
  className?: string;
}

/**
 * Reusable sort dropdown for list pages. Combined options ("Title A–Z",
 * "Newest first", …) per issue #51 — one select drives both the sort field
 * and direction. Composition follows shadcn: Field > FieldLabel + Select >
 * SelectContent > SelectGroup > SelectItem.
 */
export function ListSortSelect({
  sort,
  order,
  options,
  onChange,
  label = 'Sort by',
  id,
  className,
}: ListSortSelectProps) {
  const value = `${sort}:${order}`;
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field orientation="horizontal" className={cn('w-auto', className)}>
      <FieldLabel htmlFor={selectId}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          const option = options.find((o) => `${o.sort}:${o.order}` === next);
          if (option) onChange(option.sort, option.order);
        }}
      >
        <SelectTrigger id={selectId} className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={`${option.sort}:${option.order}`} value={`${option.sort}:${option.order}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
