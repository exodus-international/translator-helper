import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceFormat, renderReference, type Segment } from './render'

const verses = (chapter: number, ...ranges: Array<[number, number]>): Segment => ({
  chapter,
  ranges: ranges.map(([from, to]) => ({ from, to })),
})

const cases: Array<[string, string, Segment[], string]> = [
  ['en', 'John', [verses(3, [16, 17])], 'John 3:16-17'],
  ['hr', 'Iv', [verses(3, [16, 17])], 'Iv 3,16-17'],
  ['de', 'Joh', [verses(3, [16, 16])], 'Joh 3,16'],
  ['en', 'Dan', [verses(13, [1, 9], [15, 18])], 'Dan 13:1-9, 15-18'],
  ['hr', 'Dn', [verses(13, [1, 9], [15, 18])], 'Dn 13,1-9. 15-18'],
  ['de', 'Dan', [verses(13, [1, 9], [15, 18])], 'Dan 13,1-9.15-18'],
  ['en', 'Rom', [verses(8, [28, 28]), verses(12, [1, 2])], 'Rom 8:28; 12:1-2'],
  ['cs', 'Ř', [verses(8, [28, 28]), verses(12, [1, 2])], 'Ř 8,28; 12,1-2'],
  ['en', 'Ps', [{ chapter: 23, ranges: [] }], 'Ps 23'],
  ['en', 'Gen', [{ chapter: 1, toChapter: 3, ranges: [] }], 'Gen 1-3'],
]

for (const [language, abbreviation, segments, expected] of cases) {
  test(`renderReference ${language} -> ${expected}`, () => {
    assert.equal(renderReference(abbreviation, segments, referenceFormat(language)), expected)
  })
}

test('unknown languages fall back to the English format', () => {
  assert.equal(renderReference('John', [verses(3, [16, 16])], referenceFormat('xx')), 'John 3:16')
})

test('renderReference cites a book of one chapter by verse alone', () => {
  const segments: Segment[] = [{ chapter: 1, ranges: [{ from: 5, to: 13 }, { from: 17, to: 23 }] }]
  assert.equal(renderReference('Jd', segments, referenceFormat('hr'), true), 'Jd 5-13. 17-23')
  assert.equal(renderReference('Jude', [{ chapter: 1, ranges: [] }], referenceFormat('en'), true), 'Jude')
  const firstAndThird: Segment[] = [{ chapter: 1, ranges: [{ from: 1, to: 1 }, { from: 3, to: 3 }] }]
  assert.equal(renderReference('Jude', firstAndThird, referenceFormat('en'), true), 'Jude 1:1, 3')
  assert.equal(renderReference('Jd', firstAndThird, referenceFormat('hr'), true), 'Jd 1,1. 3')
})
