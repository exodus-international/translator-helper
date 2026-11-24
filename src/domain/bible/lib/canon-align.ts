import { CANON } from './canon'
import type { NormBook, NormalizedTranslation, NormChapter } from './normalized'

/**
 * Aligns a scraped translation onto the shared 73-book Catholic canon so that
 * every translation exposes identical book slots (order 1..73, USFM codes,
 * uniform slugs). Sources that print deuterocanonical additions as separate
 * books get them merged back into the parent canonical book, with chapter
 * numbers continuing after the parent's existing chapters.
 */

/** target usfm -> ordered source book slugs/usfms to concatenate */
const MERGES: Record<string, Record<string, string[]>> = {
  // Czech ČEP splits additions into separate books
  'cep-cs': {
    ESG: ['esth', 'addesth'],
    DAG: ['dan', 'prazar', 'sus', 'bel'],
  },
  // Slovenian SSP: Letter of Jeremiah is its own book; Greek Esther/Daniel
  // additions are separate. Canonical Esther = the complete Greek rendering;
  // canonical Daniel = Hebrew core + additions appended.
  'ssp-sl': {
    ESG: ['esg'],
    BAR: ['bar', 'jerp'],
    DAG: ['dan', 'dand'],
  },
}

/** source slug -> USFM for sources that don't carry usfm codes (cep-cs) */
const PREMAP: Record<string, Record<string, string>> = {
  'cep-cs': {
    gen: 'GEN', exod: 'EXO', lev: 'LEV', num: 'NUM', deut: 'DEU', josh: 'JOS', judg: 'JDG',
    ruth: 'RUT', sam1: '1SA', sam2: '2SA', kgs1: '1KI', kgs2: '2KI', chr1: '1CH', chr2: '2CH',
    ezra: 'EZR', neh: 'NEH', job: 'JOB', ps: 'PSA', prov: 'PRO', eccl: 'ECC', song: 'SNG',
    isa: 'ISA', jer: 'JER', lam: 'LAM', ezek: 'EZK', hos: 'HOS', joel: 'JOL', amos: 'AMO',
    obad: 'OBA', jonah: 'JON', mic: 'MIC', nah: 'NAM', hab: 'HAB', zeph: 'ZEP', hag: 'HAG',
    zech: 'ZEC', mal: 'MAL', tob: 'TOB', jdt: 'JDT', wis: 'WIS', sir: 'SIR', bar: 'BAR',
    macc1: '1MA', macc2: '2MA', matt: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT',
    rom: 'ROM', cor1: '1CO', cor2: '2CO', gal: 'GAL', eph: 'EPH', phil: 'PHP', col: 'COL',
    thess1: '1TH', thess2: '2TH', tim1: '1TI', tim2: '2TI', titus: 'TIT', phlm: 'PHM',
    heb: 'HEB', jas: 'JAS', pet1: '1PE', pet2: '2PE', john1: '1JN', john2: '2JN', john3: '3JN',
    jude: 'JUD', rev: 'REV',
  },
}

function findSource(books: NormBook[], key: string): NormBook | undefined {
  const k = key.toLowerCase()
  return books.find((b) => b.slug === k || (b.usfm ?? '').toLowerCase() === k)
}

export function alignToCanon(norm: NormalizedTranslation): NormalizedTranslation {
  const merges = MERGES[norm.code] ?? {}
  const premap = PREMAP[norm.code] ?? {}
  // give every source book an effective usfm where we know one
  const books = norm.books.map((b) => ({
    ...b,
    usfm: b.usfm ?? premap[b.slug] ?? null,
  }))
  const out: NormBook[] = []

  CANON.forEach((canon) => {
    const sources = merges[canon.usfm] ?? [canon.usfm.toLowerCase()]
    const picked: NormBook[] = []
    for (const key of sources) {
      const b = findSource(books, key)
      if (b && b.chapters.length > 0) picked.push(b)
    }

    if (picked.length === 0) return // will be reported by the importer

    // The main book keeps its chapter numbers, so a chapter missing from the
    // file does not shift the ones after it; merged additions continue after
    // its last chapter (source numbering inside chapters untouched).
    const chapters: NormChapter[] = picked[0]!.chapters.map((ch) => ({ ...ch }))
    let next = Math.max(0, ...chapters.map((c) => c.number)) + 1
    for (const src of picked.slice(1)) {
      for (const ch of src.chapters) {
        chapters.push({ ...ch, number: next++ })
      }
    }

    const primary = picked[0]!
    out.push({
      usfm: canon.usfm,
      name: primary.name,
      shortName: primary.shortName || primary.name,
      abbreviation: primary.abbreviation || canon.usfm,
      slug: canon.usfm.toLowerCase(), // uniform slug space across translations
      testament: canon.testament,
      chapters,
    })
  })

  return { code: norm.code, books: out.sort((a, b) => (CANON.findIndex(c => c.usfm === a.usfm)) - (CANON.findIndex(c => c.usfm === b.usfm))) }
}
