/** The bible-api "normalized" JSON shape: one file per translation. */
export interface NormVerse {
  number: number
  /** Last verse number when the translation prints several verses as one ("20-21"). */
  numberEnd?: number
  text: string
}

export interface NormHeader {
  beforeVerse: number
  title: string
}

export interface NormChapter {
  number: number
  verses: NormVerse[]
  headers?: NormHeader[]
}

export interface NormBook {
  usfm: string | null
  name: string
  shortName: string
  abbreviation: string
  slug: string
  testament: 'old' | 'new'
  chapters: NormChapter[]
}

export interface NormalizedTranslation {
  code: string
  books: NormBook[]
}
