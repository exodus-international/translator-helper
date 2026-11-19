import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { memoryBible } from './bible.memory'
import { resolvePassage, unknownLanguage, validateReference } from './bible.passages'
import { prepareTranslation } from './bible.prepare'
import { DEFAULT_INCLUDE, declarationsSchema, type Include } from './bible.types'
import { catalogMeta, TRANSLATIONS } from './lib/translations'
import type { NormalizedTranslation } from './lib/normalized'

// Port of bible-api test/passages.test.ts. Runs against the bible-api data
// directory (BIBLE_DATA_DIR, default ../bible-api/data); skipped without it.
const DATA_DIR = path.resolve(process.env.BIBLE_DATA_DIR ?? path.join(process.cwd(), '..', 'bible-api', 'data'))
const skip = fs.existsSync(path.join(DATA_DIR, 'normalized', 'rsvce-en.json')) ? false : `no Bible data at ${DATA_DIR}`

describe('resolvePassage (bible-api data)', { skip }, async () => {
  if (skip) return
  const index = memoryBible(
    TRANSLATIONS.map((def) => {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'normalized', `${def.code}.json`), 'utf8')) as NormalizedTranslation
      const declFile = path.join(DATA_DIR, 'versification', `${def.code}.json`)
      const decl = fs.existsSync(declFile) ? declarationsSchema.parse(JSON.parse(fs.readFileSync(declFile, 'utf8'))) : null
      return prepareTranslation(raw, catalogMeta(def.code)!, decl)
    }),
  )
  const t = (key: string) => index.findTranslation(key)!
  const resolve = (ref: string, tr: ReturnType<typeof t>, include?: Include) => resolvePassage(index, ref, tr, include)
  const validate = (ref: string) => validateReference(index, ref)
  const hr = t('hr')
  const de = t('de')
  const en = t('en')

  test('ok: maps, renders in the target convention and returns verse ids', async () => {
    const r = await resolve('John 3:16-17', hr)
    assert.equal(r.status, 'ok')
    assert.equal(r.book, 'JHN')
    assert.equal(r.rendered, 'Iv 3,16-17')
    assert.deepEqual(r.verses?.map((v) => v.id), ['JHN.3.16', 'JHN.3.17'])
    assert.ok(r.text?.startsWith('Jer je Bog tako ljubio svijet'))
    assert.deepEqual(r.notes, [])
  })

  test('ok: the source translation itself', async () => {
    const r = await resolve('Ps 23:1', en)
    assert.equal(r.status, 'ok')
    assert.equal(r.rendered, 'Ps 23:1')
    assert.ok(r.text?.startsWith('The Lord is my shepherd'))
  })

  test('ok: a verse list renders with the language list separator', async () => {
    assert.equal((await resolve('Dan 13:1-9, 15-18', de)).rendered, 'Dan 13,1-9.15-18')
    assert.equal((await resolve('Rom 8:28; 30', hr)).rendered, 'Rim 8,28. 30')
  })

  test('partial: verses past the end of the chapter are noted', async () => {
    const r = await resolve('John 3:30-40', hr)
    assert.equal(r.status, 'partial')
    assert.equal(r.rendered, 'Iv 3,30-36')
    assert.ok(r.notes.some((n) => n.includes('3:37-40')))
  })

  test('partial: a merged target verse is returned once with verse_end', async () => {
    const r = await resolve('Matt 17:20-22', de)
    assert.equal(r.status, 'partial')
    assert.deepEqual(
      r.verses?.map((v) => [v.id, v.verse_end]),
      [
        ['MAT.17.20-21', 21],
        ['MAT.17.22', undefined],
      ],
    )
  })

  test('a verse list that moves to the next chapter', async () => {
    const r = await resolve('Exodus 5:22-23, 6:1-13', hr)
    assert.equal(r.status, 'ok')
    assert.equal(r.verses?.length, 15)
  })

  test('a book of one chapter cited by verse alone', async () => {
    const r = await resolve('Jude 5-13, 17-23', en)
    assert.equal(r.status, 'ok')
    assert.equal(r.rendered, 'Jude 5-13, 17-23')
    const phlm = await resolve('Phlm 4', hr)
    assert.equal(phlm.verses?.[0]?.id, 'PHM.1.4')
    assert.equal(phlm.rendered, 'Flm 4')
    const firstAndThird = await resolve('Jude 1:1, 3', en)
    assert.equal(firstAndThird.rendered, 'Jude 1:1, 3')
    assert.deepEqual((await resolve(firstAndThird.rendered!, en)).verses?.map((v) => v.id), ['JUD.1.1', 'JUD.1.3'])
  })

  test('unparseable', async () => {
    assert.equal((await resolve('love', hr)).status, 'unparseable')
  })

  test('unknown_book: no prefix guessing', async () => {
    assert.equal((await resolve('Xyz 1:1', hr)).status, 'unknown_book')
    assert.equal((await resolve('Revel 1:1', en)).status, 'unknown_book')
  })

  test('unknown_language', async () => {
    assert.equal(unknownLanguage('John 3:16', 'xx').status, 'unknown_language')
  })

  test('psalm titles numbered as verses shift the psalm', async () => {
    const r = await resolve('Ps 51:3', hr)
    assert.equal(r.status, 'ok')
    assert.equal(r.rendered, 'Ps 51,5')
    assert.ok(r.text?.startsWith('Jer ja poznajem svoje bezakonje'))
    assert.equal((await resolve('Ps 22:1', de)).rendered, 'Ps 22,2')
  })

  test('a whole psalm leaves out the numbered title and says so', async () => {
    const r = await resolve('Ps 51', de)
    assert.equal(r.status, 'ok')
    assert.equal(r.rendered, 'Ps 51,3-21')
    assert.deepEqual(r.notes, ['eue-de PSA 51:1-2 has no counterpart in rsvce-en and is not included.'])
  })

  test('versification_unmapped: a chapter numbered differently', async () => {
    const r = await resolve('Ps 60:1', t('sk'))
    assert.equal(r.status, 'versification_unmapped')
    assert.equal(r.text, undefined)
  })

  test('versification_unmapped: equal verse counts with shifted text (Ps 13)', async () => {
    assert.equal((await resolve('Ps 13:1', de)).status, 'versification_unmapped')
  })

  test('versification_unmapped: a book held for manual review', async () => {
    assert.equal((await resolve('Esth 1:1', hr)).status, 'versification_unmapped')
  })

  test('out_of_range', async () => {
    assert.equal((await resolve('John 3:99', hr)).status, 'out_of_range')
    assert.equal((await resolve('Matt 18:11', hr)).status, 'out_of_range')
  })

  test('include.source adds the RSV-CE side', async () => {
    const r = await resolve('John 3:16', hr, { ...DEFAULT_INCLUDE, source: true })
    assert.equal(r.source?.rendered, 'John 3:16')
    assert.ok(r.source?.text?.startsWith('For God so loved the world'))
  })

  test('validateReference normalizes to the source convention', async () => {
    assert.deepEqual(
      await Promise.all(
        ['Exod 3:14', '1 Kgs 1:1', 'love'].map(async (ref) => {
          const v = await validate(ref)
          return [v.status, v.normalized]
        }),
      ),
      [
        ['ok', 'Exod 3:14'],
        ['ok', '1 Kgs 1:1'],
        ['unparseable', undefined],
      ],
    )
  })
  test('refuses a passage longer than a citation', async () => {
    const r = await resolve('Ps 1-150', t('sar-hr'))
    assert.equal(r.status, 'out_of_range')
    assert.match(r.notes[0]!, /more than 300 verses/)
    assert.equal((await resolve('Ps 119', t('sar-hr'))).status, 'ok')
  })
})
