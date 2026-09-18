import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyEdits, fixAll, lintDocument } from './index';
import { protectedRegions, isProtected } from './regions';
import { scanFrontmatter } from './frontmatter-entries';

const ids = (text: string, source?: string) => lintDocument({ text, source }).map((d) => d.ruleId);
const fixed = (text: string, source?: string) => fixAll({ text, source }).text;

describe('scanFrontmatter', () => {
  it('records key and value offsets', () => {
    const text = '---\ntitle: Hello\nhero: shirt-e90_2026\n---\n\n# Body\n';
    const scan = scanFrontmatter(text);
    assert.equal(scan.present, true);
    assert.deepEqual(
      scan.entries.map((e) => e.key),
      ['title', 'hero'],
    );
    const hero = scan.entries[1];
    assert.equal(text.slice(hero.keyFrom, hero.keyTo), 'hero');
    assert.equal(text.slice(hero.valueFrom, hero.valueTo), 'shirt-e90_2026');
  });

  it('reports absent frontmatter', () => {
    assert.equal(scanFrontmatter('# Just a heading\n').present, false);
  });

  it('treats an indented block as part of the key above it', () => {
    // The `reminder:` block on a day file. Reading its `title:`/`body:` as
    // top-level keys made `body` an unknown key on every day file that has one.
    const text =
      '---\ntitle: Divine Discipline\nday: 5\nreminder:\n  title: "Abstain from Meat"\n  body: "Fridays are a day of penance."\n---\n\nBody\n';
    const scan = scanFrontmatter(text);
    assert.deepEqual(
      scan.entries.map((e) => e.key),
      ['title', 'day', 'reminder'],
    );
  });

  it('still reads a block indented with a non-breaking space', () => {
    // Real files out of Word indent with U+00A0. Treating that as column zero
    // made `body` look like a top-level key on every one of them.
    // Named, because the character is invisible: a formatter is otherwise
    // free to normalise it out of the string, and the test would quietly stop
    // testing anything.
    const NBSP = String.fromCharCode(0xa0);
    const text = `---\ntitle: T\nreminder:\n${NBSP} title: "A"\n${NBSP} body: "B"\n---\n\nBody\n`;
    assert.deepEqual(
      scanFrontmatter(text).entries.map((e) => e.key),
      ['title', 'reminder'],
    );
  });

  it('does not read a comment line as a key', () => {
    // A note a translator left above the key it is about. `# Molitva` parsed as
    // a key no rule recognised, so it was reported as a translated key -- and
    // the rename offered would have turned the note into `hero:`.
    const text = '---\nday: 1\n# Molitva: opomba\nhero: shirt-e90_2026\n---\n\nBody\n';
    assert.deepEqual(
      scanFrontmatter(text).entries.map((e) => e.key),
      ['day', 'hero'],
    );
  });

  it('stops a value at the comment YAML allows after it', () => {
    const text = '---\nday: 3 # tretji dan\nhero: shirt#2\ntitle: "a # b"\ncaption: # nothing yet\n---\n\nBody\n';
    const entries = scanFrontmatter(text);
    const value = (key: string) => entries.entries.find((e) => e.key === key)!;
    assert.equal(value('day').value, '3');
    assert.equal(text.slice(value('day').valueFrom, value('day').valueTo), '3');
    // Only a `#` after whitespace, and only outside quotes, opens a comment.
    assert.equal(value('hero').value, 'shirt#2');
    assert.equal(value('title').value, '"a # b"');
    // A key whose value is nothing but a comment reads as blank, which is what
    // `frontmatter-value-empty` is there to report.
    assert.equal(value('caption').value, '');
  });

  it('measures a nested block so a fix can carry the whole thing', () => {
    const text = '---\ntitle: T\nreminder:\n  title: "A"\n  body: "B"\n---\n\nBody\n';
    const reminder = scanFrontmatter(text).entries.find((e) => e.key === 'reminder')!;
    assert.equal(text.slice(reminder.lineFrom, reminder.blockTo), 'reminder:\n  title: "A"\n  body: "B"');
    // A plain key's extent is just its own line.
    const title = scanFrontmatter(text).entries[0];
    assert.equal(title.blockTo, title.lineTo);
  });
});

describe('protectedRegions', () => {
  it('shields HTML attributes from prose rules', () => {
    const text = '<a href="https://x.com/?a=\\"b\\"">link</a>';
    const regions = protectedRegions(text);
    assert.equal(isProtected(regions, text.indexOf('https')), true);
  });

  it('leaves link text lintable but protects the destination', () => {
    const text = 'see [the "book"](https://example.com/a"b)';
    const regions = protectedRegions(text);
    assert.equal(isProtected(regions, text.indexOf('book')), false);
    assert.equal(isProtected(regions, text.indexOf('example')), true);
  });
});

describe('house style rules', () => {
  it('flags and fixes dash bullets', () => {
    const text = '# T\n\n- one\n- two\n';
    assert.deepEqual(new Set(ids(text)), new Set(['bullet-marker']));
    assert.equal(fixed(text), '# T\n\n* one\n* two\n');
  });

  it('leaves dash bullets alone when the source writes them that way', () => {
    assert.equal(ids('- one\n- two\n', '> Verse\n\n- one\n- two\n').includes('bullet-marker'), false);
  });

  it('still flags dash bullets when the source uses stars', () => {
    assert.equal(ids('- one\n', '* one\n').includes('bullet-marker'), true);
  });

  it('leaves straight quotes alone when the source uses them', () => {
    assert.equal(ids('He said "hello".\n', 'He said "hi".\n').includes('smart-quotes'), false);
  });

  it('curls quotes when the source is written with them', () => {
    assert.equal(ids('He said "hello".\n', 'He said \u201Chi\u201D.\n').includes('smart-quotes'), true);
  });

  it('accepts sort_order as a frontmatter key', () => {
    const text = '---\ntitle: A\nsort_order: 3\n---\n\nBody\n';
    assert.equal(ids(text, text).includes('frontmatter-key-translated'), false);
  });

  it('still flags a translated key', () => {
    const text = '---\ntitle: A\nnazev: B\n---\n\nBody\n';
    const source = '---\ntitle: A\nhero: B\n---\n\nBody\n';
    assert.equal(ids(text, source).includes('frontmatter-key-translated'), true);
  });

  it('does not treat the frontmatter fence as a bullet', () => {
    const text = '---\ntitle: A\n---\n\nBody\n';
    assert.equal(ids(text).includes('bullet-marker'), false);
  });

  it('strips trailing whitespace and adds a final newline', () => {
    assert.equal(fixed('# T   \n\nBody  '), '# T\n\nBody\n');
  });

  it('normalises CRLF', () => {
    assert.equal(fixed('# T\r\n\r\nBody\r\n'), '# T\n\nBody\n');
  });

  it('collapses runs of blank lines to two', () => {
    assert.equal(fixed('a\n\n\n\n\nb\n'), 'a\n\n\nb\n');
  });

  it('curls quotes in prose but never inside markup', () => {
    const text = '<iframe src="https://y.com" title="Video"></iframe>\n\nHe said "hello" to me.\n';
    const result = fixed(text);
    assert.ok(result.includes('src="https://y.com"'), 'HTML attributes must survive');
    assert.ok(result.includes('title="Video"'), 'HTML attributes must survive');
    assert.ok(result.includes('“hello”'), `expected curly quotes, got: ${result}`);
  });

  it('curls apostrophes only inside words', () => {
    assert.equal(fixed("don't stop\n"), 'don’t stop\n');
    assert.equal(fixed("'quoted' word\n"), "'quoted' word\n");
    // The word test was ASCII, so a contraction went uncurled wherever the
    // letters around the apostrophe were not: Ukrainian writes `п'ять`.
    assert.equal(fixed("п'ять хлібів\n"), 'п’ять хлібів\n');
    // (`l'homme` was already ASCII on both sides, so it always worked.)
    assert.equal(fixed("l'homme\n"), 'l’homme\n');
  });

  it('opens a quote after punctuation from any language', () => {
    // The rule tested a list of characters a quote may open after, and every
    // language whose own quotation marks were missing from it got a closing
    // ” where an opening “ belonged -- on the first quote of every
    // quotation. It now asks whether the quote closes something instead.
    const opens = ['「', '„', '«', '‹', '（', '¿', '-', '—'];
    for (const before of opens) {
      assert.equal(fixed(`${before}"a"\n`), `${before}“a”\n`, `after ${JSON.stringify(before)}`);
    }
    // And what a quote does close still closes: a letter, a digit, the
    // punctuation that ends a clause, a bracket.
    for (const before of ['a', '1', '.', ',', '!', ')', '…']) {
      assert.equal(fixed(`${before}"\n`), `${before}”\n`, `after ${JSON.stringify(before)}`);
    }
    assert.equal(fixed('Rekel je: "Pridi."\n'), 'Rekel je: “Pridi.”\n');
  });

  // Named, because the character is invisible: a formatter is free to
  // normalise a literal one out of the string and the test would quietly stop
  // testing anything.
  const NBSP = String.fromCharCode(0xa0);

  it('replaces a no-break space typed in the middle of a sentence', () => {
    const text = `Otevriť${NBSP}sa jeho slovu.\n`;
    assert.ok(ids(text).includes('no-nbsp'));
    assert.equal(fixed(text), 'Otevriť sa jeho slovu.\n');
  });

  it('keeps the no-break space that holds a one-letter preposition', () => {
    // Czech and Slovak typography forbids ending a line on `v`.
    const text = `růstu v${NBSP}ctnosti\n`;
    assert.equal(ids(text).includes('no-nbsp'), false);
    assert.equal(fixed(text), text);
  });

  it('sees a no-break space inside the frontmatter, where it breaks the block', () => {
    const text = `---\ntitle: T\nreminder:\n${NBSP} body: "B"\n---\n\nBody\n`;
    assert.ok(ids(text).includes('no-nbsp'));
  });

  it('replaces a tab after a list marker', () => {
    assert.equal(fixed('1.\tMelkisedek\n'), '1. Melkisedek\n');
  });

  it('offers to replace an indenting tab but leaves it to a human', () => {
    const text = '* one\n\t* nested\n';
    const [diagnostic] = lintDocument({ text }).filter((d) => d.ruleId === 'no-tab');
    assert.ok(diagnostic, 'expected a no-tab diagnostic');
    assert.equal(diagnostic.fix?.safe, false);
    // Depth is the author's call, so "fix all" must not flatten it.
    assert.ok(fixed(text).includes('\t'));
  });

  it('leaves a tab inside a code fence alone', () => {
    const text = '```\nconst a\t= 1;\n```\n';
    assert.equal(ids(text).includes('no-tab'), false);
  });
});

describe('brokenFormatting', () => {
  const diagnostics = (text: string) => lintDocument({ text }).filter((d) => d.ruleId === 'broken-formatting');

  it('reports emphasis wrapped across a blank line once, at the opener', () => {
    const text =
      '*A ti, kad se moliš, uđi u svoju sobu, zatvori vrata i pomoli se Ocu svomu, koji je u tajnosti.” — Matej 6,6\n\n' +
      'A ti, kad se moliš, uđi u svoju sobu, zatvori vrata i pomoli se Ocu svomu, koji je u tajnosti.” — Matej 6,6*\n';

    const found = diagnostics(text);
    assert.equal(found.length, 1);
    assert.match(found[0].message, /closed in a later paragraph \(line 3\)/);
    assert.equal(found[0].from, 0);
  });

  it('leaves an underscore inside a word alone in any script', () => {
    // The intraword test was `[0-9A-Za-z]`, so the underscore in a Cyrillic
    // word had a letter on neither side: it opened emphasis that never closed,
    // and the rule reported an error -- on a filename copied correctly.
    assert.deepEqual(diagnostics('Дивіться файл день_1.md для подробиць.\n'), []);
    assert.deepEqual(diagnostics('see day_1.md for more\n'), []);
    assert.deepEqual(diagnostics('Použij súbor deň_1.md\n'), []);
    // A marker that really does open emphasis still reports.
    assert.equal(diagnostics('Почніть _тут і зараз\n').length, 1);
  });

  it('reports an opener that never closes', () => {
    const found = diagnostics('Bold here: **a discipline you commit to.\n');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /never closed/);
  });

  it('reports a closer that was never opened, with an escape hint', () => {
    const found = diagnostics('A discipline you commit to.**\n');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /without an opening marker/);
    assert.match(found[0].message, /\\\*\\\*/);
  });

  it('accepts balanced markers in one paragraph, across lines', () => {
    assert.deepEqual(ids('**a discipline you commit to**\nand *the disposition* it brings.\n'), []);
    assert.deepEqual(ids('***both at once***\n'), []);
    assert.deepEqual(ids('Read the `hero` key.\n'), []);
  });

  it('does not mistake literal punctuation for markers', () => {
    assert.deepEqual(ids('* Prayer — twenty minutes\n* Fraternity — a brother\n'), []);
    assert.deepEqual(ids('Five * three is fifteen.\n'), []);
    assert.deepEqual(ids('hero: markdown_reference-exodus_2026\n'), []);
    // Fill-in blanks on the check-in sheets.
    assert.deepEqual(ids('Celý čas modlitby: ___ / 7\n\nKvalita modlitby (1-5): ___\n'), []);
    // Escaped, so deliberately literal.
    assert.deepEqual(ids('Five \\* three is fifteen.\n'), []);
  });

  it('leaves markers inside markup and code alone', () => {
    assert.deepEqual(ids('<span style="color:#CC0000;">All stand.</span>\n'), []);
    assert.deepEqual(ids('[link](https://example.com/a*b_c)\n'), []);
    assert.deepEqual(ids('```\nconst a = 5 * 3;\n```\n'), []);
  });

  it('closes an unclosed opener at the end of its paragraph', () => {
    const text = 'Bold here: **a discipline you commit to.\n';
    const [found] = diagnostics(text);
    assert.equal(found.fix?.title, 'Close the emphasis here');
    assert.equal(applyEdits(text, found.fix!.edits), 'Bold here: **a discipline you commit to.**\n');
  });

  it('keeps the emphasis where it was opened, and drops the far marker', () => {
    const text = '*Be still, and know that I am God.\n\nBe still, and know that I am God.*\n';
    const [found] = diagnostics(text);
    assert.equal(
      applyEdits(text, found.fix!.edits),
      '*Be still, and know that I am God.*\n\nBe still, and know that I am God.\n',
    );
  });

  it('removes a stray closer', () => {
    const text = 'A discipline you commit to.**\n';
    const [found] = diagnostics(text);
    assert.equal(found.fix?.title, 'Remove the stray marker');
    assert.equal(applyEdits(text, found.fix!.edits), 'A discipline you commit to.\n');
  });

  it('offers every repair one at a time, never in bulk', () => {
    // Each fix decides where the emphasis lands, which is the translator's
    // call — so "fix all" must leave the document alone.
    for (const text of [
      '*Be still, and know that I am God.\n\nBe still, and know that I am God.*\n',
      'Bold here: **a discipline you commit to.\n',
      'A discipline you commit to.**\n',
    ]) {
      const [found] = diagnostics(text);
      assert.equal(found.fix?.safe, false);
      assert.equal(fixed(text), text);
    }
  });
});

describe('parity rules', () => {
  const source =
    '---\ntitle: Day One\nsubtitle: Sub\ncaption: Cap\nhero: shirt-e90_2026\n---\n\n# Heading\n\nRead [the guide](https://exodus90.com/guide).\n';

  it('stays quiet on a translation nobody has typed in yet', () => {
    // Starting a translation creates the version with empty content, and the
    // editor mounts on it straight away. Judged against the source, every
    // parity rule would report the whole document as missing before the
    // translator has written a word.
    assert.deepEqual(ids('', source), []);
    // Whitespace only is the same story for the parity rules; the house-style
    // rules still have their own say about the whitespace itself.
    assert.deepEqual(
      ids('   \n\n', source).filter((id) => id.startsWith('frontmatter-') || id === 'link-url-changed' || id === 'heading-structure'),
      [],
    );
  });

  it('accepts a faithful translation', () => {
    const text =
      '---\ntitle: Prvi dan\nsubtitle: Podnaslov\ncaption: Natpis\nhero: shirt-e90_2026\n---\n\n# Naslov\n\nPročitaj [vodič](https://exodus90.com/guide).\n';
    assert.deepEqual(ids(text, source), []);
  });

  it('offers to rename a translated frontmatter key but never applies it in bulk', () => {
    const text = source.replace('hero:', 'hrdina:');
    const [diagnostic] = lintDocument({ text, source }).filter((d) => d.ruleId === 'frontmatter-key-translated');
    assert.ok(diagnostic, 'expected a frontmatter-key-translated diagnostic');
    assert.match(diagnostic.message, /hero/);
    assert.equal(diagnostic.fix?.safe, false);
    assert.ok(applyEdits(text, diagnostic.fix!.edits).includes('hero: shirt-e90_2026'));
    // The other reading of one unknown key beside one missing key is a key the
    // translator added while a real one went missing. Renaming relabels their
    // line, and `frontmatter-value-changed` -- whose fix *is* safe -- then
    // replaces the value under the new name, so between the two passes what
    // they wrote is gone. Reported and offered, never taken unasked.
    assert.ok(fixed(text, source).includes('hrdina'), 'fix all must leave the key alone');
  });

  it('catches a rewritten hero slug and restores it', () => {
    const text = source.replace('shirt-e90_2026', 'parallel-e90_2026');
    assert.ok(ids(text, source).includes('frontmatter-value-changed'));
    assert.ok(fixed(text, source).includes('hero: shirt-e90_2026'));
  });

  it('catches a dropped frontmatter key and re-adds it with the source value', () => {
    const text = source.replace('hero: shirt-e90_2026\n', '');
    assert.ok(ids(text, source).includes('frontmatter-missing-key'));
    assert.ok(fixed(text, source).includes('hero: shirt-e90_2026'));
  });

  it('offers to restore a changed URL but never applies it in bulk', () => {
    const text = source.replace('https://exodus90.com/guide', 'https://example.org/other');
    const [diagnostic] = lintDocument({ text, source }).filter((d) => d.ruleId === 'link-url-changed');
    assert.ok(diagnostic, 'expected a link-url-changed diagnostic');
    assert.equal(diagnostic.fix?.safe, false);
    assert.equal(applyEdits(text, diagnostic.fix!.edits).includes('https://exodus90.com/guide'), true);
    // A translator may have swapped in a same-language link on purpose.
    assert.ok(fixed(text, source).includes('https://example.org/other'), 'fix all must leave it alone');
  });

  it('reports a dropped link without guessing a fix', () => {
    const text = source.replace('Read [the guide](https://exodus90.com/guide).', 'Read the guide.');
    const diagnostics = lintDocument({ text, source }).filter((d) => d.ruleId === 'link-url-changed');
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].fix, undefined);
  });

  it('catches heading level drift and restores the source level', () => {
    const text = source.replace('# Heading', '## Heading');
    assert.ok(ids(text, source).includes('heading-structure'));
    assert.ok(fixed(text, source).includes('\n# Heading'));
  });

  it('counts only the headings a reader sees', () => {
    // The library shows markdown to the translator inside fenced blocks, and
    // `^#` is not a heading there -- nor in a frontmatter comment. Counting
    // them meant a translation that dropped a sample reported a heading
    // structure that had not drifted.
    const fenced = source.replace('# Heading\n', '# Heading\n\n```md\n# Sample\n## Another\n```\n');
    const translation = '---\ntitle: Prvi dan\nsubtitle: Podnaslov\ncaption: Natpis\nhero: shirt-e90_2026\n---\n\n# Naslov\n\nPro\u010ditaj [vodi\u010d](https://exodus90.com/guide).\n';
    assert.ok(!ids(translation, fenced).includes('heading-structure'));
    // And a `#` comment in the frontmatter is not a heading either.
    const commented = translation.replace('hero:', '# opomba: ne prevajaj\nhero:');
    assert.ok(!ids(commented, fenced).includes('heading-structure'));
  });

  it('leaves a translator\'s note on a slug alone', () => {
    // `day: 3 # tretji dan` is day 3. Comparing the raw text called the day
    // changed, and the fix offered -- a safe one, applied by "fix all" --
    // replaced the whole span and deleted the note.
    const numbered = source.replace('hero: shirt-e90_2026', 'day: 3');
    const annotated = numbered.replace('day: 3', 'day: 3 # tretji dan');
    assert.ok(!ids(annotated, numbered).includes('frontmatter-value-changed'));
    assert.ok(fixed(annotated, numbered).includes('# tretji dan'));

    // A real mismatch is still caught, and still keeps the note.
    const wrong = numbered.replace('day: 3', 'day: 4 # tretji dan');
    assert.ok(ids(wrong, numbered).includes('frontmatter-value-changed'));
    const after = fixed(wrong, numbered);
    assert.ok(after.includes('day: 3 # tretji dan'), after);
  });

  it('skips source-dependent rules when no source is supplied', () => {
    const text = source.replace('hero:', 'hrdina:');
    assert.equal(ids(text).includes('frontmatter-key-translated'), false);
  });

  it('leaves a faithfully translated reminder block alone', () => {
    const withReminder =
      '---\ntitle: Day One\nhero: shirt-e90_2026\nreminder:\n  title: "Abstain from Meat"\n  body: "Fridays are a day of penance."\n---\n\n# Heading\n';
    const text =
      '---\ntitle: Prvi dan\nhero: shirt-e90_2026\nreminder:\n  title: "Suzdrži se od mesa"\n  body: "Petci su dan pokore."\n---\n\n# Naslov\n';
    assert.deepEqual(ids(text, withReminder), []);
  });

  it('accepts the field guide and exercise keys as the content team writes them', () => {
    const guide = '---\ntitle: Weekly Meeting Guide\nidentifier: weekly_meeting_guide\nsection_order: 1\n---\n\n# H\n';
    const text =
      '---\ntitle: Vodič za tjedni sastanak\nidentifier: weekly_meeting_guide\nsection_order: 1\n---\n\n# N\n';
    assert.deepEqual(ids(text, guide), []);
  });

  it('still catches a renumbered section_order', () => {
    const guide = '---\ntitle: T\nidentifier: weekly_meeting_guide\nsection_order: 4\n---\n\n# H\n';
    const text = guide.replace('section_order: 4', 'section_order: 6');
    assert.ok(ids(text, guide).includes('frontmatter-value-changed'));
    assert.ok(fixed(text, guide).includes('section_order: 4'));
  });

  it('re-adds a dropped reminder block with its text, not a bare key', () => {
    const withReminder =
      '---\ntitle: Day One\nhero: a_2026\nreminder:\n  title: "Abstain from Meat"\n  body: "Fridays are a day of penance."\n---\n\n# H\n';
    const text = '---\ntitle: Prvi dan\nhero: a_2026\n---\n\n# N\n';
    assert.ok(ids(text, withReminder).includes('frontmatter-missing-key'));
    const result = fixed(text, withReminder);
    assert.ok(result.includes('  title: "Abstain from Meat"'), `expected the block body, got:\n${result}`);
    assert.ok(result.includes('  body: "Fridays are a day of penance."'));
  });

  it('leaves a localised scripture citation alone', () => {
    // The Croatian Bible abbreviates the book and separates chapter from verse
    // with a comma. Treating verse_tag as a slug reported this on 1,903 of the
    // 4,144 pairs, and the fix was safe, so "fix all" put the English back.
    const day = '---\ntitle: Day One\nverse_tag: Matthew 28:1-10\n---\n\n# H\n';
    const text = '---\ntitle: Prvi dan\nverse_tag: Mt 28,1-10\n---\n\n# N\n';
    assert.deepEqual(ids(text, day), []);
    assert.equal(fixed(text, day), text);
  });

  it('leaves a citation alone when the two Bibles versify differently', () => {
    // Not a typo: the Czech Daniel really does run to 3,98.
    const day = '---\ntitle: T\nverse_tag: Daniel 4:1-12\n---\n\n# H\n';
    const text = '---\ntitle: P\nverse_tag: Daniel 3,98-4,9\n---\n\n# N\n';
    assert.deepEqual(ids(text, day), []);
  });

  it('reports a citation left blank and offers the source one', () => {
    const day = '---\ntitle: T\nverse_tag: Matthew 28:1-10\n---\n\n# H\n';
    const text = '---\ntitle: P\nverse_tag:\n---\n\n# N\n';
    const [diagnostic] = lintDocument({ text, source: day }).filter((d) => d.ruleId === 'frontmatter-value-empty');
    assert.ok(diagnostic, 'expected a frontmatter-value-empty diagnostic');
    assert.equal(diagnostic.fix?.safe, false);
    assert.ok(applyEdits(text, diagnostic.fix!.edits).includes('verse_tag: Matthew 28:1-10'));
    // The citation has to be rewritten into the target Bible, so "fix all"
    // must not paste the English one in and call the file done.
    assert.equal(fixed(text, day), text);
  });

  it('does not read a nested block as a blank value', () => {
    const withReminder = '---\ntitle: Day One\nreminder:\n  title: "Abstain"\n  body: "Friday."\n---\n\n# H\n';
    const text = '---\ntitle: Prvi dan\nreminder:\n  title: "Suzdrži se"\n  body: "Petak."\n---\n\n# N\n';
    assert.deepEqual(ids(text, withReminder), []);
  });
});

describe('untranslated content', () => {
  const english =
    '---\ntitle: T\n---\n\n# Freedom, Family, and Vocation\n\n' +
    'A man who has never been asked to give anything up has never been asked to choose. '.repeat(4) +
    '\n';

  it('reports a body that is still the English source', () => {
    const text = english.replace('title: T', 'title: P');
    const [diagnostic] = lintDocument({ text, source: english }).filter((d) => d.ruleId === 'body-untranslated');
    assert.ok(diagnostic, 'expected a body-untranslated diagnostic');
    assert.equal(diagnostic.scope, 'document');
    assert.equal(diagnostic.fix, undefined, 'there is nothing to repair, only writing to do');
  });

  it('says it once rather than once per heading', () => {
    const text = english.replace('title: T', 'title: P');
    assert.equal(ids(text, english).includes('heading-untranslated'), false);
  });

  it('reports a heading left in English under translated prose', () => {
    const text = english.replace(
      /A man who[\s\S]*/,
      'Muž, od kterého nikdy nikdo nic nežádal, si nikdy nemusel vybrat.\n',
    );
    const [diagnostic] = lintDocument({ text, source: english }).filter((d) => d.ruleId === 'heading-untranslated');
    assert.ok(diagnostic, 'expected a heading-untranslated diagnostic');
    assert.equal(text.slice(diagnostic.from, diagnostic.to), 'Freedom, Family, and Vocation');
  });

  it('leaves a short heading alone, which is as likely to be a name kept', () => {
    const source = '---\ntitle: T\n---\n\n# Amen\n\nLet us pray for the grace to begin again.\n';
    const text = '---\ntitle: P\n---\n\n# Amen\n\nModleme se za milost za\u010D\u00EDt znovu.\n';
    assert.deepEqual(ids(text, source), []);
  });
});

describe('lineBreaksDropped', () => {
  const source = '---\ntitle: T\n---\n\n<p>Line one<br>Line two<br>Line three</p>\n';

  it('reports a translation that dropped every break', () => {
    const text = '---\ntitle: P\n---\n\n<p>Prvi redak Drugi redak Tre\u0107i redak</p>\n';
    const [diagnostic] = lintDocument({ text, source }).filter((d) => d.ruleId === 'line-breaks-dropped');
    assert.ok(diagnostic, 'expected a line-breaks-dropped diagnostic');
    assert.equal(diagnostic.scope, 'document');
  });

  it('accepts a different count, which a translator may have meant', () => {
    const text = '---\ntitle: P\n---\n\n<p>Prvi redak<br>Drugi i tre\u0107i redak</p>\n';
    assert.equal(ids(text, source).includes('line-breaks-dropped'), false);
  });

  it('says nothing when the source breaks no lines either', () => {
    const plain = '---\ntitle: T\n---\n\n<p>One sentence.</p>\n';
    const text = '---\ntitle: P\n---\n\n<p>Jedna re\u010Denica.</p>\n';
    assert.equal(ids(text, plain).includes('line-breaks-dropped'), false);
  });
});

describe('applyEdits', () => {
  it('applies right-to-left so offsets stay valid', () => {
    assert.equal(
      applyEdits('abcdef', [
        { from: 0, to: 1, insert: 'X' },
        { from: 4, to: 6, insert: 'Y' },
      ]),
      'XbcdY',
    );
  });

  it('skips an overlapping edit, keeping the rightmost of the two', () => {
    assert.equal(
      applyEdits('abcdef', [
        { from: 1, to: 4, insert: 'X' },
        { from: 2, to: 5, insert: 'Y' },
      ]),
      'abYf',
    );
  });
});

describe('fixAll', () => {
  it('reports what it fixed and what is left for a human', () => {
    const source = '---\ntitle: T\nhero: a_2026\n---\n\n# H\n\n[x](https://a.com) [y](https://b.com)\n';
    const text = '---\ntitle: P\nhero: b_2026\n---\n\n# H   \n\n[x](https://a.com)\n';
    const result = fixAll({ text, source });
    assert.ok(result.fixed > 0);
    assert.ok(result.text.includes('hero: a_2026'), 'hero restored');
    assert.ok(!/[ \t]+$/m.test(result.text), 'whitespace cleaned');
    // The dropped link still needs a translator.
    assert.deepEqual(
      result.remaining.map((d) => d.ruleId),
      ['link-url-changed'],
    );
  });

  it('is a no-op on a clean document', () => {
    const clean = '# Title\n\n* one\n* two\n';
    const result = fixAll({ text: clean });
    assert.equal(result.text, clean);
    assert.equal(result.fixed, 0);
  });
});
