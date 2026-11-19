# The Bible

The app holds its own copy of each language's Catholic Bible, the same text
translators copy in by hand (Croatian: Šarić). Scripture in a translation
always comes from it: the AI never translates a reading or a citation, and
translators can check and replace citations from the editor.

The code is in `src/domain/bible/` (data, import, resolver) and
`src/domain/scripture/` (what a document's Scripture becomes).

## Bibles and versification

One English Bible, RSV-CE, is the **source**: references in source documents
are written against it. Every other Bible is a **target** for one language.
The first target imported for a language becomes that language's Bible; an
admin can make another one the default.

Chapter and verse numbers differ between Bibles. Croatian numbers psalm titles
as verses, so `Psalm 46:10` is `Ps 46,11` in Šarić. A target's numbering is
recorded per book as **versification**:

- A book is **declared** once its numbering has been checked against RSV-CE.
  Until then, no passage from it is resolved: a wrong verse is worse than none.
- **Mapping rows** say how a source chapter or verse range lands in the target
  (`Source 51:1-19 → target 51, verse +2`). The most specific row wins.
- An **unmappable** chapter is one whose numbering is known to differ and has
  no rows yet; passages in it are refused.
- **Reviewed** marks a book a person has checked.

## Importing

Bibles come as bible-api files: `normalized/<code>.json` (the text) and
`versification/<code>.json` (the declarations).

- From a bible-api checkout: `pnpm bible:import ../bible-api/data` imports
  every translation there, the source first; add codes to import only those
  (`pnpm bible:import ../bible-api/data sar-hr`).
- In the app: **Admin → Bible → Import**. The browser compresses the file
  before upload; the server refuses anything over 30 MB unpacked.

Importing a code that exists replaces it in one transaction. Importing the
text without a versification file keeps the declarations the translation
already has. A versification file alone replaces only the declarations.

The seven bible-api translations (`rsvce-en`, `sar-hr`, `eue-de`, `knb-hu`,
`cep-cs`, `ssv-sk`, `ssp-sl`) need no metadata; any other code needs its name,
language and role.

## Scripture in AI translations

| In the English source | In the translation |
|---|---|
| `verse_tag: James 1:21-24` | `verse_tag: Jak 1,21-24` |
| The text under `# A Reading from …`, which is the `verse_tag` passage | The official text, a verse per line when the source has one |
| A citation line followed by the reading (`<span …>James 5:11-13</span>`, then the italic text) | The citation and the official text |
| A citation anywhere in the text (`(John 3:16)`, `— Psalm 46:10`) | The citation as that Bible writes it (`Iv 3,16`, `Ps 46,11`) |

1. Before the model sees the source, every reading and citation the Bible
   resolves is replaced with a placeholder (`{{bible:1}}`). The model is told
   to keep the placeholders. For quoted citations it gets the official wording.
2. The model translates everything else.
3. Each placeholder is filled from the Bible, and `verse_tag` is set from it.

Anything that needs a translator's eye shows as a warning after the AI draft
arrives:

- **Not in the Bible.** The reference can't be resolved: its chapter has no
  mapping yet, or the verses are missing from RSV-CE. The AI translated that
  reading or citation, so check it against the Bible.
- **Shortened or another translation.** The English reading leaves verses out
  or quotes another translation. The full passage was inserted; trim it to
  match.
- **Does not match.** The English reading is not that passage in RSV-CE, which
  usually means a lectionary psalm numbered differently. The AI translated it.
- **The AI dropped …** The model lost a placeholder; add the citation or
  reading by hand.

If no Bible is imported for the language, the whole document is translated by
the AI and one warning says so.

## Limits

One reference covers at most 300 verses and one lookup at most 2000, so a
citation cannot be used to read the whole Bible in one request. Imports are
admin-only; reading is open to every signed-in user.
