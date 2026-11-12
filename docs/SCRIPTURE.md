# Scripture in AI translations

The AI never translates Scripture. Readings and citations come from the
target language's Catholic Bible through the
[Bible API](https://github.com/exodus-international/bible-api), the same text
translators copy in by hand (Croatian: Šarić). The code is in
`src/domain/scripture/scripture.service.ts`.

## What is replaced

| In the English source | In the translation |
|---|---|
| `verse_tag: James 1:21-24` | `verse_tag: Jak 1,21-24` |
| The text under `# A Reading from …`, which is the `verse_tag` passage | The official text, a verse per line when the source has one |
| A citation line followed by the reading (`<span …>James 5:11-13</span>`, then the italic text) | The citation and the official text |
| A citation anywhere in the text (`(John 3:16)`, `— Psalm 46:10`) | The citation as that Bible writes it (`Iv 3,16`, `Ps 46,11`) |

Chapter and verse numbers follow the target Bible: Croatian numbers psalm
titles as verses, so `Psalm 46:10` becomes `Ps 46,11`.

## How

1. Before the model sees the source, every reading and citation the API
   resolves is replaced with a placeholder (`{{bible:1}}`). The model is told
   to keep the placeholders. For quoted citations it gets the official wording.
2. The model translates everything else.
3. Each placeholder is filled from the API, and `verse_tag` is set from it.

## Notices

Anything that needs a translator's eye shows as a warning after the AI draft
arrives:

- **Not in the Bible API.** The API can't map the reference yet. Some
  chapters are numbered differently and have no mapping; some verses are
  missing from RSV-CE. The AI translated that reading or citation, so check it
  against the Bible.
- **Shortened or another translation.** The English reading leaves verses out
  or quotes another translation. The full passage was inserted; trim it to
  match.
- **Does not match.** The English reading is not that passage in RSV-CE, which
  usually means a lectionary psalm numbered differently. The AI translated it.
- **The AI dropped …** The model lost a placeholder; add the citation or
  reading by hand.

If the API can't be reached, or has no Bible for the language, the whole
document is translated by the AI and one warning says so.

## Configuration

| Env var | Effect |
|---|---|
| `BIBLE_API_URL` | Where the API runs; on Coolify, its internal address (`http://bible-api:3000`) |
| `BIBLE_API_TOKEN` | This app's token, one of the API's `BIBLE_API_TOKENS` |

Both are server-only. Never prefix them with `NEXT_PUBLIC_`: the token must not
reach the browser.
