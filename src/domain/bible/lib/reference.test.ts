import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeBook, parseReference, type VerseRange } from './reference'

const v = (fromChapter: number, fromVerse: number | null, toChapter: number, toVerse: number | null): VerseRange => ({
  fromChapter,
  fromVerse,
  toChapter,
  toVerse,
})

const cases: Array<[string, ReturnType<typeof parseReference>]> = [
  ['John 3:16', [{ book: 'John', ranges: [v(3, 16, 3, 16)] }]],
  ['John 3:16-18', [{ book: 'John', ranges: [v(3, 16, 3, 18)] }]],
  ['John 3:16-18, 20', [{ book: 'John', ranges: [v(3, 16, 3, 18), v(3, 20, 3, 20)] }]],
  ['John 3:16-4:2', [{ book: 'John', ranges: [v(3, 16, 4, 2)] }]],
  ['John 3.16', [{ book: 'John', ranges: [v(3, 16, 3, 16)] }]],
  ['Iv 3,16-18.20', [{ book: 'Iv', ranges: [v(3, 16, 3, 18), v(3, 20, 3, 20)] }]],
  ['Dan 13:1-9, 15-18', [{ book: 'Dan', ranges: [v(13, 1, 13, 9), v(13, 15, 13, 18)] }]],
  ['Ps 23', [{ book: 'Ps', ranges: [v(23, null, 23, null)] }]],
  ['Gen 1-3', [{ book: 'Gen', ranges: [v(1, null, 3, null)] }]],
  ['1 Cor 13:4-7', [{ book: '1 Cor', ranges: [v(13, 4, 13, 7)] }]],
  ['1Cor 13:4', [{ book: '1Cor', ranges: [v(13, 4, 13, 4)] }]],
  ['Mark 1:18a', [{ book: 'Mark', ranges: [v(1, 18, 1, 18)] }]],
  ['Rom 8:28; 12:1-2', [{ book: 'Rom', ranges: [v(8, 28, 8, 28), v(12, 1, 12, 2)] }]],
  ['Rom 8:28; 30', [{ book: 'Rom', ranges: [v(8, 28, 8, 28), v(8, 30, 8, 30)] }]],
  ['Gen 1; 3', [{ book: 'Gen', ranges: [v(1, null, 1, null), v(3, null, 3, null)] }]],
  [
    'Rom 8:28; 1 Cor 13:4',
    [
      { book: 'Rom', ranges: [v(8, 28, 8, 28)] },
      { book: '1 Cor', ranges: [v(13, 4, 13, 4)] },
    ],
  ],
  ['Exod 5:22-23, 6:1-13', [{ book: 'Exod', ranges: [v(5, 22, 5, 23), v(6, 1, 6, 13)] }]],
  ['Gen 3:20-24, 4:1-7, 9', [{ book: 'Gen', ranges: [v(3, 20, 3, 24), v(4, 1, 4, 7), v(4, 9, 4, 9)] }]],
  ['Jude 5-13, 17-23', null], // a verse list without a chapter, unless the caller says the book has one
  ['love', null],
  ['John', null],
  ['', null],
  ['John 3:18-16', null],
  ['John 0:1', null],
  ['John 3:0', null],
  ['Gen 3-1', null],
  ['; 30', null],
]

for (const [input, expected] of cases) {
  test(`parseReference(${JSON.stringify(input)})`, () => {
    assert.deepEqual(parseReference(input), expected)
  })
}

test('a book of one chapter is cited by verse alone', () => {
  const singleChapter = (book: string) => book === 'Jude' || book === 'Jud'
  const parse = (input: string) => parseReference(input, { singleChapter })?.[0]!.ranges
  assert.deepEqual(parse('Jude 5-13, 17-23'), [v(1, 5, 1, 13), v(1, 17, 1, 23)])
  assert.deepEqual(parse('Jude 3'), [v(1, 3, 1, 3)])
  assert.deepEqual(parse('Jude 1:5'), [v(1, 5, 1, 5)])
  assert.deepEqual(parse('Jud 1,5.7'), [v(1, 5, 1, 5), v(1, 7, 1, 7)])
  assert.deepEqual(parse('Jude 5; 7'), [v(1, 5, 1, 5), v(1, 7, 1, 7)])
  assert.deepEqual(parseReference('John 3', { singleChapter })?.[0]!.ranges, [v(3, null, 3, null)])
})

test('normalizeBook folds case, spaces, punctuation and diacritics', () => {
  assert.equal(normalizeBook('1 Kor.'), '1kor')
  assert.equal(normalizeBook('Röm'), 'rom')
  assert.equal(normalizeBook('Đelo'), 'djelo')
  assert.equal(normalizeBook('Ž'), 'z')
})
