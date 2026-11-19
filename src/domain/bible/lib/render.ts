/**
 * Renders a resolved reference as a citation in the target language's
 * convention ("Iv 3,16-17", not "John 3:16-17"). Pure.
 */

export interface ReferenceFormat {
  bookSep: string
  chapterVerseSep: string
  verseRangeSep: string
  rangeListSep: string
  segmentSep: string
}

const ENGLISH: ReferenceFormat = { bookSep: ' ', chapterVerseSep: ':', verseRangeSep: '-', rangeListSep: ', ', segmentSep: '; ' }
const CONTINENTAL: ReferenceFormat = { ...ENGLISH, chapterVerseSep: ',', rangeListSep: '.' }

const REFERENCE_FORMATS: Record<string, ReferenceFormat> = {
  en: ENGLISH,
  hr: { ...CONTINENTAL, rangeListSep: '. ' },
  de: CONTINENTAL,
  hu: CONTINENTAL,
  sl: CONTINENTAL,
  cs: CONTINENTAL,
  sk: CONTINENTAL,
}

export function referenceFormat(language: string): ReferenceFormat {
  return REFERENCE_FORMATS[language] ?? ENGLISH
}

export interface Segment {
  chapter: number
  /** Last chapter of a run of whole chapters ("Gen 1-3"); only with empty ranges. */
  toChapter?: number
  /** Empty = the whole chapter. */
  ranges: Array<{ from: number; to: number }>
}

/** Books of one chapter are cited by verse alone: "Jude 5", not "Jude 1:5". */
export function renderReference(abbreviation: string, segments: Segment[], f: ReferenceFormat, singleChapter = false): string {
  const ranges = segments.flatMap((s) => s.ranges)
  // "Jude 1, 3" would read back as chapter 1, verse 3, so a list that opens with verse 1 keeps its chapter.
  const opensWithVerseOne = ranges.length > 1 && ranges[0]!.from === 1 && ranges[0]!.to === 1
  if (singleChapter && !opensWithVerseOne) {
    if (ranges.length === 0) return abbreviation
    return `${abbreviation}${f.bookSep}${ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}${f.verseRangeSep}${r.to}`)).join(f.rangeListSep)}`
  }
  const parts = segments.map((s) => {
    if (s.ranges.length === 0) {
      return s.toChapter && s.toChapter !== s.chapter ? `${s.chapter}${f.verseRangeSep}${s.toChapter}` : `${s.chapter}`
    }
    const ranges = s.ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}${f.verseRangeSep}${r.to}`))
    return `${s.chapter}${f.chapterVerseSep}${ranges.join(f.rangeListSep)}`
  })
  return `${abbreviation}${f.bookSep}${parts.join(f.segmentSep)}`
}
