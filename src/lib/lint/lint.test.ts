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
  });
});

describe('parity rules', () => {
  const source =
    '---\ntitle: Day One\nsubtitle: Sub\ncaption: Cap\nhero: shirt-e90_2026\n---\n\n# Heading\n\nRead [the guide](https://exodus90.com/guide).\n';

  it('accepts a faithful translation', () => {
    const text =
      '---\ntitle: Prvi dan\nsubtitle: Podnaslov\ncaption: Natpis\nhero: shirt-e90_2026\n---\n\n# Naslov\n\nPročitaj [vodič](https://exodus90.com/guide).\n';
    assert.deepEqual(ids(text, source), []);
  });

  it('catches a translated frontmatter key and renames it back', () => {
    const text = source.replace('hero:', 'hrdina:');
    assert.ok(ids(text, source).includes('frontmatter-key-translated'));
    assert.ok(fixed(text, source).includes('hero: shirt-e90_2026'));
    assert.ok(!fixed(text, source).includes('hrdina'));
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

  it('skips source-dependent rules when no source is supplied', () => {
    const text = source.replace('hero:', 'hrdina:');
    assert.equal(ids(text).includes('frontmatter-key-translated'), false);
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
