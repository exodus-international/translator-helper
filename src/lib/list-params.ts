// Shared helpers for server-side list pages (Documents, Users, Projects).
//
// Every list page speaks the same URL dialect so state stays shareable and
// bookmarkable:
//
//   ?page=2        1-based page number (default 1)
//   ?q=foo         free-text search (legacy ?search= is accepted too)
//   ?sort=title    one of the page's allowed sort fields
//   ?order=asc     asc | desc
//   ?pageSize=25   rows per page (legacy ?perPage= is accepted too)
//
// Kept free of React/Prisma so it can be unit tested in isolation.

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_ORDER = 'desc' as const;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;

export type SortOrder = 'asc' | 'desc';

export interface ListParamsOptions {
  allowedSorts: readonly string[];
  defaultSort: string;
  defaultOrder?: SortOrder;
  defaultPageSize?: number;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  sort: string;
  order: SortOrder;
  /** Prisma-friendly offset. */
  skip: number;
  /** Prisma-friendly limit. */
  take: number;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseOrder(raw: string | undefined, fallback: SortOrder): SortOrder {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'asc' || normalized === 'desc') return normalized;
  return fallback;
}

/**
 * Parses Next.js `searchParams` into validated list params. Unknown sort
 * fields fall back to the page default so a stale bookmark never 500s.
 */
export function parseListParams(raw: RawSearchParams, options: ListParamsOptions): ListParams {
  const defaultOrder = options.defaultOrder ?? DEFAULT_ORDER;
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  const page = parsePositiveInt(firstValue(raw.page), DEFAULT_PAGE);
  const pageSizeRaw = firstValue(raw.pageSize) ?? firstValue(raw.perPage);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(MIN_PAGE_SIZE, parsePositiveInt(pageSizeRaw, defaultPageSize)),
  );

  const q = (firstValue(raw.q) ?? firstValue(raw.search) ?? '').trim();

  const sortRaw = firstValue(raw.sort)?.trim() ?? '';
  const sort = options.allowedSorts.includes(sortRaw) ? sortRaw : options.defaultSort;
  const order = parseOrder(firstValue(raw.order), defaultOrder);

  return {
    page,
    pageSize,
    q,
    sort,
    order,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function getTotalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export interface PaginationRange {
  start: number;
  end: number;
  total: number;
  /** e.g. "Showing 1–25 of 142". Uses an en-dash, matching the issue spec. */
  text: string;
}

/**
 * The "Showing 1–25 of 142" line. Clamps the page into range so a bookmark
 * past the last page still reads sensibly instead of "Showing 101–100 of 40".
 */
export function getPaginationRange(page: number, pageSize: number, total: number): PaginationRange {
  if (total === 0) {
    return { start: 0, end: 0, total: 0, text: 'No results' };
  }
  const totalPages = getTotalPages(total, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  return { start, end, total, text: `Showing ${start}–${end} of ${total}` };
}

/**
 * Merge updates into the current query string while preserving every other
 * filter (language, folder, status tabs, project, …). Passing `null` removes
 * a key so defaults stay out of the URL. Setting `q` or `sort` resets to
 * page 1 unless the caller passes an explicit `page`.
 */
export function buildListSearchParams(
  current: URLSearchParams | Record<string, string>,
  updates: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  if (current instanceof URLSearchParams) {
    current.forEach((value, key) => {
      params.append(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(current)) {
      params.set(key, value);
    }
  }

  const resetsPage = 'q' in updates || 'search' in updates || 'sort' in updates || 'pageSize' in updates;

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  if (resetsPage && !('page' in updates)) {
    params.delete('page');
  }

  // Legacy aliases never leak into new URLs.
  if ('q' in updates) params.delete('search');
  if ('pageSize' in updates) params.delete('perPage');

  const query = params.toString();
  return query ? `?${query}` : '';
}

export type PageToken = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Visible page numbers with ellipsis. Shows every page up to 7, otherwise
 * first / last with a sliding window around the current page.
 */
export function getPageTokens(page: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages];
  }
  if (page >= totalPages - 3) {
    return [1, 'ellipsis-start', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages];
}

/**
 * Converts Next.js `searchParams` (values may repeat) into URLSearchParams
 * for merging with `buildListSearchParams` — e.g. redirecting an
 * out-of-range ?page= to the last valid page while keeping every filter.
 */
export function toURLSearchParams(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  return search;
}
