'use client';

import { useId } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPageTokens, getPaginationRange, getTotalPages } from '@/lib/list-params';
import { cn } from '@/lib/utils';

interface ListPaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Builds a shareable href for a page so links stay bookmarkable. */
  getPageHref?: (page: number) => string;
  pageSizeOptions?: number[];
  /** Override for the rows-per-page label association (defaults to a unique id). */
  pageSizeSelectId?: string;
  className?: string;
}

/**
 * Reusable server-side pagination for list pages (issue #51): prev/next +
 * page numbers built on the shadcn Pagination composition, plus the
 * "Showing 1–25 of 142" range line and a configurable page-size select.
 */
export function ListPagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  getPageHref,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  pageSizeSelectId,
}: ListPaginationProps) {
  const totalPages = getTotalPages(total, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const range = getPaginationRange(safePage, pageSize, total);
  const tokens = getPageTokens(safePage, totalPages);
  const generatedId = useId();
  const sizeSelectId = pageSizeSelectId ?? generatedId;

  const hrefFor = (target: number) => getPageHref?.(target) ?? '#';

  const goTo = (e: React.MouseEvent, target: number) => {
    // Always prevent the default anchor navigation: without a getPageHref the
    // href is '#' (page jump + history entry), with one we navigate
    // client-side while the href stays bookmarkable for middle-click.
    e.preventDefault();
    if (target === safePage) return;
    onPageChange(target);
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
          {range.text}
        </p>
        {onPageSizeChange && (
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor={sizeSelectId}>Rows per page</FieldLabel>
            <Select
              value={String(pageSize)}
              onValueChange={(next) => onPageSizeChange(Number(next))}
            >
              <SelectTrigger id={sizeSelectId} className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination className="mx-0 justify-start sm:justify-center">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={hrefFor(safePage - 1)}
                aria-disabled={safePage <= 1}
                tabIndex={safePage <= 1 ? -1 : undefined}
                className={cn(safePage <= 1 && 'pointer-events-none opacity-50')}
                onClick={(e) => {
                  if (safePage <= 1) {
                    e.preventDefault();
                    return;
                  }
                  goTo(e, safePage - 1);
                }}
              />
            </PaginationItem>
            {tokens.map((token) =>
              token === 'ellipsis-start' || token === 'ellipsis-end' ? (
                <PaginationItem key={token}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={token}>
                  <PaginationLink
                    href={hrefFor(token)}
                    isActive={token === safePage}
                    aria-label={`Go to page ${token}`}
                    onClick={(e) => goTo(e, token)}
                  >
                    {token}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={hrefFor(safePage + 1)}
                aria-disabled={safePage >= totalPages}
                tabIndex={safePage >= totalPages ? -1 : undefined}
                className={cn(safePage >= totalPages && 'pointer-events-none opacity-50')}
                onClick={(e) => {
                  if (safePage >= totalPages) {
                    e.preventDefault();
                    return;
                  }
                  goTo(e, safePage + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
