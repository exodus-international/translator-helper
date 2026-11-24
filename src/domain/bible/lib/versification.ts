/**
 * Maps a source (RSV-CE) address onto a target translation's numbering. Pure.
 *
 * A book is only mappable once it has been declared for the target (see
 * data/versification/). Inside a declared book, the most specific matching row
 * wins and no row means identity.
 */

export interface MappingRow {
  srcChapter: number
  srcVerseFrom: number | null // null = the whole chapter
  srcVerseTo: number | null
  dstChapter: number
  offset: number
  unmappable: boolean
}

export interface Address {
  chapter: number
  verse: number
}

/** Returns null when the address is marked unmappable. */
export function mapVerse(rows: MappingRow[], chapter: number, verse: number): Address | null {
  let best: MappingRow | undefined
  for (const r of rows) {
    if (r.srcChapter !== chapter) continue
    if (r.srcVerseFrom === null) {
      best ??= r
      continue
    }
    if (verse >= r.srcVerseFrom && verse <= (r.srcVerseTo ?? Infinity)) {
      best = r
      break
    }
  }
  if (!best) return { chapter, verse }
  if (best.unmappable) return null
  return { chapter: best.dstChapter, verse: verse + best.offset }
}
