export interface CanonBook {
  usfm: string
  testament: 'old' | 'new'
}

// The 73 books of the Catholic canon in canonical order (1..73).
export const CANON: CanonBook[] = [
  { usfm: 'GEN', testament: 'old' },
  { usfm: 'EXO', testament: 'old' },
  { usfm: 'LEV', testament: 'old' },
  { usfm: 'NUM', testament: 'old' },
  { usfm: 'DEU', testament: 'old' },
  { usfm: 'JOS', testament: 'old' },
  { usfm: 'JDG', testament: 'old' },
  { usfm: 'RUT', testament: 'old' },
  { usfm: '1SA', testament: 'old' },
  { usfm: '2SA', testament: 'old' },
  { usfm: '1KI', testament: 'old' },
  { usfm: '2KI', testament: 'old' },
  { usfm: '1CH', testament: 'old' },
  { usfm: '2CH', testament: 'old' },
  { usfm: 'EZR', testament: 'old' },
  { usfm: 'NEH', testament: 'old' },
  { usfm: 'TOB', testament: 'old' },
  { usfm: 'JDT', testament: 'old' },
  { usfm: 'ESG', testament: 'old' }, // Esther with Greek additions
  { usfm: '1MA', testament: 'old' },
  { usfm: '2MA', testament: 'old' },
  { usfm: 'JOB', testament: 'old' },
  { usfm: 'PSA', testament: 'old' },
  { usfm: 'PRO', testament: 'old' },
  { usfm: 'ECC', testament: 'old' },
  { usfm: 'SNG', testament: 'old' },
  { usfm: 'WIS', testament: 'old' },
  { usfm: 'SIR', testament: 'old' },
  { usfm: 'ISA', testament: 'old' },
  { usfm: 'JER', testament: 'old' },
  { usfm: 'LAM', testament: 'old' },
  { usfm: 'BAR', testament: 'old' }, // incl. Letter of Jeremiah where merged
  { usfm: 'EZK', testament: 'old' },
  { usfm: 'DAG', testament: 'old' }, // Daniel with Greek additions
  { usfm: 'HOS', testament: 'old' },
  { usfm: 'JOL', testament: 'old' },
  { usfm: 'AMO', testament: 'old' },
  { usfm: 'OBA', testament: 'old' },
  { usfm: 'JON', testament: 'old' },
  { usfm: 'MIC', testament: 'old' },
  { usfm: 'NAM', testament: 'old' },
  { usfm: 'HAB', testament: 'old' },
  { usfm: 'ZEP', testament: 'old' },
  { usfm: 'HAG', testament: 'old' },
  { usfm: 'ZEC', testament: 'old' },
  { usfm: 'MAL', testament: 'old' },
  { usfm: 'MAT', testament: 'new' },
  { usfm: 'MRK', testament: 'new' },
  { usfm: 'LUK', testament: 'new' },
  { usfm: 'JHN', testament: 'new' },
  { usfm: 'ACT', testament: 'new' },
  { usfm: 'ROM', testament: 'new' },
  { usfm: '1CO', testament: 'new' },
  { usfm: '2CO', testament: 'new' },
  { usfm: 'GAL', testament: 'new' },
  { usfm: 'EPH', testament: 'new' },
  { usfm: 'PHP', testament: 'new' },
  { usfm: 'COL', testament: 'new' },
  { usfm: '1TH', testament: 'new' },
  { usfm: '2TH', testament: 'new' },
  { usfm: '1TI', testament: 'new' },
  { usfm: '2TI', testament: 'new' },
  { usfm: 'TIT', testament: 'new' },
  { usfm: 'PHM', testament: 'new' },
  { usfm: 'HEB', testament: 'new' },
  { usfm: 'JAS', testament: 'new' },
  { usfm: '1PE', testament: 'new' },
  { usfm: '2PE', testament: 'new' },
  { usfm: '1JN', testament: 'new' },
  { usfm: '2JN', testament: 'new' },
  { usfm: '3JN', testament: 'new' },
  { usfm: 'JUD', testament: 'new' },
  { usfm: 'REV', testament: 'new' },
]

export const CANON_ORDER_BY_USFM = new Map(CANON.map((b, i) => [b.usfm, i + 1]))

// Esther and Daniel are aligned with their Greek additions (ESG, DAG) but are
// published under the standard ids, so citations of "Esth" or "Dan" find them.
const PUBLIC_IDS: Record<string, string> = { ESG: 'EST', DAG: 'DAN' }

export function publicBookId(usfm: string): string {
  return PUBLIC_IDS[usfm] ?? usfm
}
