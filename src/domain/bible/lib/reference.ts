/**
 * Language-neutral Bible reference parser. Pure: no DB access.
 *
 * Accepts both notations:
 *   English:  "John 3:16-18, 20; 4:1"   (':' = chapter/verse, ',' = verse list)
 *   European: "Iv 3,16-18.20; 4,1"      (',' = chapter/verse, '.' = verse list)
 * plus "John 3.16", whole chapters ("Ps 23"), chapter ranges ("Gen 1-3"),
 * cross-chapter ranges ("John 3:16-4:2"), verse suffixes ("18a" -> 18) and a
 * new book after ';' ("Rom 8:28; 1 Cor 13:4"). After ';' a bare number continues
 * the previous chapter ("Rom 8:28; 30" = 8:30) unless that was a whole chapter.
 * In English notation a list item may start a new chapter ("Exod 5:22-23, 6:1-13").
 * Books of one chapter are cited by verse alone ("Jude 5-13, 17-23"); the caller
 * says which books those are, since the parser knows no books.
 *
 * Returns null for anything that is not a reference: prose, a bare book name,
 * reversed ranges, and zero chapters or verses.
 */

export interface VerseRange {
  fromChapter: number
  fromVerse: number | null // null = start of chapter
  toChapter: number
  toVerse: number | null // null = end of chapter
}

export interface ParsedPassage {
  book: string // raw book token, resolved by the caller
  ranges: VerseRange[]
}

/**
 * The key a book name is looked up by: lower case, no spaces or punctuation,
 * and no accents on Latin letters ("Röm" is "rom", "1 Kor." is "1kor").
 *
 * Letters of every script are kept. Keeping only a-z left "1 Кор" and "1 Сам"
 * both as "1", so a Ukrainian citation resolved to whichever numbered book came
 * first. Accents come off Latin letters alone, because й and ї are letters of
 * the Ukrainian alphabet and not и and і with a mark.
 */
export function normalizeBook(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const BOOK_AND_SPEC = /^((?:[1-4]\s*\.?\s*)?\p{L}[\p{L}\s.]*?)\.?\s*(\d.*)$/u
const ITEM = /^(\d+)[a-z]?(?:\s*[-–—]\s*(?:(\d+)\s*[:,]\s*)?(\d+)[a-z]?)?$/i

function parseSpec(spec: string): VerseRange[] | null {
  const s = spec.replace(/\s+/g, ' ').trim()
  const european = !s.includes(':')
  // "John 3.16": a '.' right after the chapter is the chapter/verse separator
  // when nothing else is.
  const head = european
    ? (s.match(/^(\d+)\s*,\s*(.+)$/) ?? (s.includes(',') ? null : s.match(/^(\d+)\s*\.\s*(.+)$/)))
    : s.match(/^(\d+)\s*:\s*(.+)$/)

  if (!head) {
    // whole chapter or chapter range: "23", "1-3"
    const m = s.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/)
    if (!m) return null
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (from < 1 || to < from) return null
    return [{ fromChapter: from, fromVerse: null, toChapter: to, toVerse: null }]
  }

  let chapter = Number(head[1])
  const items = head[2]!.split(european ? /\s*\.\s*/ : /\s*[,.]\s*/).filter(Boolean)
  const ranges: VerseRange[] = []
  for (let item of items) {
    const next = european ? null : item.match(/^(\d+)\s*:\s*(.+)$/)
    if (next) {
      chapter = Number(next[1])
      item = next[2]!
    }
    const m = item.trim().match(ITEM)
    if (!m) return null
    const fromVerse = Number(m[1])
    const toChapter = m[2] ? Number(m[2]) : chapter
    const toVerse = m[3] ? Number(m[3]) : fromVerse
    if (chapter < 1 || fromVerse < 1 || toVerse < 1) return null
    if (toChapter < chapter || (toChapter === chapter && toVerse < fromVerse)) return null
    ranges.push({ fromChapter: chapter, fromVerse, toChapter, toVerse })
  }
  return ranges.length ? ranges : null
}

export interface ParseOptions {
  /** Whether a raw book token names a book of one chapter. */
  singleChapter?: (book: string) => boolean
}

/** Returns null when the input is not a reference. */
export function parseReference(input: string, options: ParseOptions = {}): ParsedPassage[] | null {
  const parts = input.split(';').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null

  const out: ParsedPassage[] = []
  for (const part of parts) {
    const withBook = part.match(BOOK_AND_SPEC)
    let book: string
    let spec: string
    if (withBook) {
      book = withBook[1]!.trim()
      spec = withBook[2]!
      // "Jude 5-13" is verses 5-13; "Jude 1:5" and "Jud 1,5" already name the chapter.
      if (options.singleChapter?.(book) && !spec.includes(':') && !/^1\s*[,.]\s*\d/.test(spec)) spec = `1:${spec}`
    } else {
      const prev = out[out.length - 1]
      if (!prev || !/^\d/.test(part)) return null
      book = prev.book
      const last = prev.ranges[prev.ranges.length - 1]!
      // "Rom 8:28; 30" -> 8:30, but "Gen 1; 3" -> chapter 3
      spec = last.toVerse !== null && !/[:,.]/.test(part) ? `${last.toChapter}:${part}` : part
    }
    const ranges = parseSpec(spec)
    if (!ranges) return null
    const prev = out[out.length - 1]
    if (prev && prev.book === book) prev.ranges.push(...ranges)
    else out.push({ book, ranges })
  }
  return out
}
