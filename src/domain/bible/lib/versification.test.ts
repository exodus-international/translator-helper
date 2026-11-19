import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapVerse, type MappingRow } from './versification'

const row = (r: Partial<MappingRow> & Pick<MappingRow, 'srcChapter'>): MappingRow => ({
  srcVerseFrom: null,
  srcVerseTo: null,
  dstChapter: r.srcChapter,
  offset: 0,
  unmappable: false,
  ...r,
})

// Hebrew/RSV psalm numbering onto a Greek/Vulgate-numbered edition.
const psalms: MappingRow[] = [
  row({ srcChapter: 23, dstChapter: 22 }),
  row({ srcChapter: 51, dstChapter: 50, offset: 2 }),
  row({ srcChapter: 10, dstChapter: 9, offset: 21 }),
  row({ srcChapter: 116, srcVerseFrom: 1, srcVerseTo: 9, dstChapter: 114 }),
  row({ srcChapter: 116, srcVerseFrom: 10, srcVerseTo: 19, dstChapter: 115, offset: -9 }),
  row({ srcChapter: 3, unmappable: true }),
  row({ srcChapter: 4, unmappable: true }),
  row({ srcChapter: 4, srcVerseFrom: 5, srcVerseTo: 8, offset: 1 }),
]

test('a whole-chapter row moves the chapter', () => {
  assert.deepEqual(mapVerse(psalms, 23, 1), { chapter: 22, verse: 1 })
})

test('a whole-chapter row applies its verse offset', () => {
  assert.deepEqual(mapVerse(psalms, 51, 3), { chapter: 50, verse: 5 })
})

test('a chapter can map into the end of another', () => {
  assert.deepEqual(mapVerse(psalms, 10, 1), { chapter: 9, verse: 22 })
})

test('a split chapter maps each verse range on its own', () => {
  assert.deepEqual(mapVerse(psalms, 116, 9), { chapter: 114, verse: 9 })
  assert.deepEqual(mapVerse(psalms, 116, 10), { chapter: 115, verse: 1 })
  assert.deepEqual(mapVerse(psalms, 116, 19), { chapter: 115, verse: 10 })
})

test('an unmappable chapter returns null', () => {
  assert.equal(mapVerse(psalms, 3, 1), null)
})

test('a verse-specific row wins over a whole-chapter row', () => {
  assert.deepEqual(mapVerse(psalms, 4, 6), { chapter: 4, verse: 7 })
  assert.equal(mapVerse(psalms, 4, 1), null)
})

test('no row means identity', () => {
  assert.deepEqual(mapVerse(psalms, 1, 1), { chapter: 1, verse: 1 })
  assert.deepEqual(mapVerse([], 150, 6), { chapter: 150, verse: 6 })
})
