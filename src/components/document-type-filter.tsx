'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DOCUMENT_TYPE_CONFIGS, DOCUMENT_TYPE_SEQUENCE } from '@/constants/document-type';
import { DocumentTypeFilterValue, NO_TYPE, toggleDocumentTypeFilter } from '@/domain/document/document-type-filter';
import { ChevronDown } from 'lucide-react';

function triggerLabel(selected: readonly DocumentTypeFilterValue[]): string {
  if (selected.length === 0) return 'All types';
  if (selected.length === 1) {
    const [value] = selected;
    return value === NO_TYPE ? 'No type' : DOCUMENT_TYPE_CONFIGS[value].name;
  }
  return `${selected.length} types`;
}

export function DocumentTypeFilter({
  selected,
  onChange,
}: {
  selected: DocumentTypeFilterValue[];
  onChange: (selected: DocumentTypeFilterValue[]) => void;
}) {
  const toggle = (value: DocumentTypeFilterValue) => onChange(toggleDocumentTypeFilter(selected, value));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-[140px] justify-between font-normal sm:min-w-[160px]">
          <span className={selected.length === 0 ? 'text-muted-foreground' : undefined}>{triggerLabel(selected)}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {DOCUMENT_TYPE_SEQUENCE.map((type) => {
          const config = DOCUMENT_TYPE_CONFIGS[type];
          const Icon = config.icon;
          return (
            <DropdownMenuCheckboxItem
              key={type}
              checked={selected.includes(type)}
              onCheckedChange={() => toggle(type)}
              onSelect={(e) => e.preventDefault()}
            >
              <Icon className={`h-4 w-4 ${config.color.textClass}`} />
              {config.name}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuCheckboxItem
          checked={selected.includes(NO_TYPE)}
          onCheckedChange={() => toggle(NO_TYPE)}
          onSelect={(e) => e.preventDefault()}
        >
          No type
        </DropdownMenuCheckboxItem>
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear filter</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
