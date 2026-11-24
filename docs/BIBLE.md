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
| A quotation of the whole passage beside a citation (`"Be still, and know that I am God." — Psalm 46:10`) | The official text inside the quotation marks |

1. Before the model sees the source, every reading and citation the Bible
   resolves is replaced with a placeholder (`{{bible:1}}`). The model is told
   to keep the placeholders. A quotation of only part of a cited passage is
   left to the model, which gets the official wording to follow, and a warning
   says to check it.
2. The model translates everything else.
3. Each placeholder is filled from the Bible, and `verse_tag` is set from it.

A day whose `verse_tag` is empty is still filled: the reading under its one
`# A Reading from …` heading is looked up in RSV-CE by its text (the verse its
first sentence opens and the verse its last sentence closes). When the passage
found matches the reading, the reading is filled from the Bible, `verse_tag` is
set in the translation, and a warning names the passage to check. When the
text is not found, the AI translates the reading and a warning says to add the
`verse_tag`.

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
the AI as before, with no warning: most languages have no Bible yet. If the
Bible cannot be read, the AI translates the Scripture and one warning says so.

## Where to find it

- **Bible** (sidebar, everyone): a chat that answers with the official text.
  Ask for a passage, search for words or compare a citation with RSV-CE; every
  passage it quotes comes from the app's Bible, never from the model, and can
  be copied as a citation. It opens in the Bible of your first language;
  `/bible?translation=hr` opens another.
- **Admin → Bible texts** (admins): every imported Bible with its versification
  coverage, and **Import** for a bible-api file. A translation's page has four
  tabs: **Books** (declare and review each book), **Read** (the text by
  chapter), **Versification** (verses per chapter beside RSV-CE, the mapping
  rows, adding and removing rows) and **Try it** (resolve any reference the way
  a translation will).
- **The editor**: citations in a translation are underlined (amber when the
  Bible can't supply them). Hovering one shows the passage in the document's
  Bible, the citation as that Bible writes it and how a quotation beside it
  differs from the official text, with buttons to fix the notation or use the
  official text.
- **The Scripture card** in the document panel lists every citation in the
  translation with its verdict, in document order; clicking one goes to it.
  **Fix all notations** rewrites English citations (`John 3:16` → `Iv 3,16`)
  in one undo step. A citation already in the target's notation whose numbers
  would change (a psalm, say) is flagged to check, never rewritten, since it
  may already use the target's numbering. Citations the source has and the
  translation lacks are listed too. A translation whose `verse_tag` is empty
  (one made by hand, say) still has its reading checked: against the source's
  `verse_tag`, or, when the source has none either, against the passage the
  source's reading is found as by its text. **Set verse_tag** writes it in.
  **Ask the Bible** opens the chat beside the editor; **Insert** puts a
  passage at the cursor.
- Reviewers get the same card. It changes the text only while the review can
  be edited; otherwise it only checks.
- **New document**: under the content box, a summary of the citations found
  in the source and any that RSV-CE can't resolve, and, when `verse_tag` is
  empty, the passage the reading was found as by its text.

## Limits

One reference covers at most 300 verses and one lookup at most 2000, so a
citation cannot be used to read the whole Bible in one request. Imports are
admin-only; reading is open to every signed-in user.
